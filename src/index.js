import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { LocalStorage } from "node-localstorage";

global.Olm = require("olm");

import * as matrix from "matrix-js-sdk";

import logger from "./logger";


const ENCRYPTION_CONFIG = { algorithm: "m.megolm.v1.aes-sha2" };

class OcrccBot {
  constructor() {
    this.awaitingAgreement = {};
    this.awaitingFacilitator = {};
    this.client = matrix.createClient(process.env.MATRIX_SERVER_URL);
    this.joinedRooms = [];
  }

  createLocalStorage() {
    const storageLoc = `matrix-chatbot-${process.env.BOT_USERNAME}`;
    const dir = path.resolve(path.join(os.homedir(), ".local-storage"));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const localStoragePath = path.resolve(path.join(dir, storageLoc));
    return new LocalStorage(localStoragePath);
  }

  sendMessage(roomId, msgText) {
    return this.client
      .sendTextMessage(roomId, msgText)
      .then(res => {
        logger.log("info", "Message sent");
        logger.log("info", res);
      })
      .catch(err => {
        switch (err["name"]) {
          case "UnknownDeviceError":
            Object.keys(err.devices).forEach(userId => {
              Object.keys(err.devices[userId]).map(deviceId => {
                this.client.setDeviceVerified(userId, deviceId, true);
              });
            });
            return this.sendMessage(roomId, msgText);
            break;
          default:
            logger.log("error", "Error sending message");
            logger.log("error", err);
            break;
        }
      });
  }

  inviteFacilitators(roomId) {
    this.awaitingFacilitator[roomId] = true;
    let chatOffline = true;
    this.client
      .getJoinedRoomMembers(process.env.FACILITATOR_ROOM_ID)
      .then(members => {
        let onlineMembersCount = 0;
        Object.keys(members["joined"]).forEach(member => {
          const user = this.client.getUser(member);
          if (user.presence === "online" && member !== process.env.BOT_USERID) {
            logger.log("info", "INVITING MEMBER: " + member);
            chatOffline = false;
            this.client.invite(roomId, member);
          }
        });
      })
      .then(() => {
        if (chatOffline) {
          this.sendMessage(roomId, process.env.CHAT_OFFLINE_MESSAGE);
        }
      })
      .catch(err => {
        logger.log("error", "ERROR GETTING ROOM MEMBERS");
        logger.log("error", err);
      });
  }

  uninviteFacilitators(roomId) {
    this.awaitingFacilitator[roomId] = false;
    this.client
      .getJoinedRoomMembers(process.env.FACILITATOR_ROOM_ID)
      .then(allFacilitators => {
        this.client.getJoinedRoomMembers(roomId).then(roomMembers => {
          const membersIds = Object.keys(roomMembers["joined"]);
          const facilitatorsIds = Object.keys(allFacilitators["joined"]);
          facilitatorsIds.forEach(f => {
            if (!membersIds.includes(f)) {
              logger.log("info", "kicking out " + f + " from " + roomId);
              this.client
                .kick(roomId, f, "A facilitator has already joined this chat.")
                .then(() => {
                  logger.log("info", "Kick success");
                })
                .catch(err => {
                  logger.log("error", err);
                });
            }
          });
        });
      })
      .catch(err => logger.log("error", err));
  }

  start() {
    const localStorage = this.createLocalStorage();

    this.client
      .login("m.login.password", {
        user: process.env.BOT_USERNAME,
        password: process.env.BOT_PASSWORD,
        initial_device_display_name: process.env.BOT_DISPLAY_NAME
      })
      .then(data => {
        const accessToken = data.access_token;
        const deviceId = data.device_id;

        // create new client with full options

        let opts = {
          baseUrl: process.env.MATRIX_SERVER_URL,
          accessToken: accessToken,
          userId: process.env.BOT_USERID,
          deviceId: deviceId,
          sessionStore: new matrix.WebStorageSessionStore(localStorage)
        };

        this.client = matrix.createClient(opts);
      })
      .catch(err => {
        logger.log("error", `Login error: ${err}`);
      })
      .then(() =>
        this.client.initCrypto().catch(err => {
          logger.log("error", `ERROR STARTING CRYPTO: ${err}`);
        })
      )
      .then(() =>
        this.client.getJoinedRooms().then(data => {
          this.joinedRooms = data["joined_rooms"];
        })
      )
      .then(() => {
        // Automatically accept all room invitations
        this.client.on("RoomMember.membership", (event, member) => {
          if (
            member.membership === "invite" &&
            member.userId === process.env.BOT_USERID &&
            !this.joinedRooms.includes(member.roomId)
          ) {
            logger.log("info", "Auto-joining room " + member.roomId);
            this.client
              .joinRoom(member.roomId)
              .then(room => {
                this.sendMessage(
                  process.env.FACILITATOR_ROOM_ID,
                  `A support seeker requested a chat (Room ID: ${member.roomId})`
                );
                this.client.setRoomEncryption(member.roomId, ENCRYPTION_CONFIG);
              })
              .then(() => this.inviteFacilitators(member.roomId));
          }

          // When the first facilitator joins a support session, uninvite the other facilitators
          if (
            member.membership === "join" &&
            member.userId !== process.env.BOT_USERID &&
            this.awaitingFacilitator[member.roomId]
          ) {
            this.sendMessage(
              member.roomId,
              `${member.name} has joined the chat.`
            );
            this.sendMessage(
              process.env.FACILITATOR_ROOM_ID,
              `${member.name} joined the chat (Room ID: ${member.roomId})`
            );
            this.uninviteFacilitators(member.roomId);
          }
        });
      })
      .finally(() => this.client.startClient());
  }
}

const bot = new OcrccBot();
bot.start();
