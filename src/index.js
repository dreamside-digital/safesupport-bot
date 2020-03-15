import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { LocalStorage } from "node-localstorage";

global.Olm = require("olm");

import * as matrix from "matrix-js-sdk";

import logger from "./logger";

const ENCRYPTION_CONFIG = { algorithm: "m.megolm.v1.aes-sha2" };
const KICK_REASON = "A facilitator has already joined this chat.";
const BOT_ERROR_MESSAGE =
  "Something went wrong on our end, please restart the chat and try again.";
const MAX_RETRIES = 3;

class OcrccBot {
  constructor() {
    this.awaitingFacilitator = {};
    this.client = matrix.createClient(process.env.MATRIX_SERVER_URL);
    this.joinedRooms = [];
    this.activeChatrooms = {};
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
    return this.client.sendTextMessage(roomId, msgText).catch(err => {
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
          logger.log("error", `ERROR SENDING MESSAGE: ${err}`);
          this.handleBotCrash(roomId, err);
          break;
      }
    });
  }

  inviteUserToRoom(client, roomId, member, retries = 0) {
    logger.log("info", "INVITING MEMBER: " + member);
    if (retries > MAX_RETRIES) {
      this.handleBotCrash(roomId, "Rate limit exceeded for bot account");
      return logger.log(
        "error",
        `RATE LIMIT EXCEEDED AND RETRY LIMIT EXCEEDED`
      );
    }
    return client.invite(roomId, member).catch(err => {
      switch (err["name"]) {
        case "M_LIMIT_EXCEEDED":
          logger.log("info", "Rate limit exceeded, retrying.");
          const retryCount = retries + 1;
          const delay = retryCount * 2 * 1000;
          return setTimeout(
            this.inviteUserToRoom,
            delay,
            client,
            roomId,
            member,
            retryCount
          );
          break;
        default:
          logger.log("error", `ERROR INVITING MEMBER: ${err}`);
          this.handleBotCrash(roomId, err);
          break;
      }
    });
  }

  kickUserFromRoom(client, roomId, member, retries = 0) {
    logger.log("info", "KICKING OUT MEMBER: " + member);
    if (retries > MAX_RETRIES) {
      this.handleBotCrash(roomId, "Rate limit exceeded for bot account.");
      return logger.log(
        "error",
        `RATE LIMIT EXCEEDED AND RETRY LIMIT EXCEEDED`
      );
    }
    return client.kick(roomId, member, KICK_REASON).catch(err => {
      switch (err["name"]) {
        case "M_LIMIT_EXCEEDED":
          logger.log("info", "Rate limit exceeded, retrying.");
          const retryCount = retries + 1;
          const delay = retryCount * 2 * 1000;
          return setTimeout(
            this.kickUserFromRoom,
            delay,
            client,
            roomId,
            member,
            retryCount
          );
          break;
        default:
          this.handleBotCrash(roomId, err);
          logger.log("error", `ERROR KICKING OUT MEMBER: ${err}`);
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
            chatOffline = false;
            this.inviteUserToRoom(this.client, roomId, member);
          }
        });
      })
      .then(() => {
        if (chatOffline) {
          this.sendMessage(roomId, process.env.CHAT_OFFLINE_MESSAGE);
        }
      })
      .catch(err => {
        this.handleBotCrash(roomId, err);
        logger.log("error", `ERROR GETTING ROOM MEMBERS: ${err}`);
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
              this.kickUserFromRoom(this.client, roomId, f);
            }
          });
        });
      })
      .catch(err => {
        this.handleBotCrash(roomId, err);
        logger.log("error", err);
      });
  }

  handleBotCrash(roomId, error) {
    if (roomId) {
      this.sendMessage(roomId, BOT_ERROR_MESSAGE);
    }

    this.sendMessage(
      process.env.FACILITATOR_ROOM_ID,
      `The Help Bot ran into an error: ${error}. Please verify that the chat service is working.`
    );
  }

  writeToTranscript(event) {
    try {
      const sender = event.getSender();
      const roomId = event.getRoomId();
      const content = event.getContent();
      const date = event.getDate();
      const time = date.toLocaleTimeString("en-GB", {
        timeZone: "America/New_York"
      });
      const filepath = this.activeChatrooms[roomId].transcriptFile;

      if (!content) {
        return;
      }

      const message = `${sender} [${time}]: ${content.body}\n`;

      fs.appendFileSync(filepath, message, "utf8");
    } catch (err) {
      logger.log("error", `ERROR APPENDING TO TRANSCRIPT FILE: ${err}`);
    }
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
        logger.log("error", `ERROR WITH LOGIN: ${err}`);
      })
      .then(() => {
        this.client.getDevices().then(data => {
          const currentDeviceId = this.client.getDeviceId();
          const allDeviceIds = data.devices.map(d => d.device_id);
          const oldDevices = allDeviceIds.filter(id => id !== currentDeviceId);
          logger.log("info", `DELETING OLD DEVICES: ${oldDevices}`);
          this.client.deleteMultipleDevices(oldDevices).catch(err => {
            const auth = {
              session: err.data.session,
              type: "m.login.password",
              user: process.env.BOT_USERID,
              identifier: { type: "m.id.user", user: process.env.BOT_USERID },
              password: process.env.BOT_PASSWORD
            };
            this.client
              .deleteMultipleDevices(oldDevices, auth)
              .then(() => logger.log("info", "DELETED OLD DEVICES"))
              .catch(err =>
                logger.log(
                  "error",
                  `ERROR DELETING OLD DEVICES: ${JSON.stringify(err.data)}`
                )
              );
          });
        });
      })
      .then(() => this.client.initCrypto())
      .catch(err => logger.log("error", `ERROR STARTING CRYPTO: ${err}`))
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
              })
              .then(() => this.inviteFacilitators(member.roomId))
              .catch(err => {
                logger.log("error", err);
              });
          }

          // When a facilitator joins a support session, revoke the other invitations
          if (
            member.membership === "join" &&
            member.userId !== process.env.BOT_USERID &&
            this.awaitingFacilitator[member.roomId]
          ) {
            this.activeChatrooms[member.roomId] = {
              facilitator: member.userId
            };
            this.sendMessage(
              member.roomId,
              `${member.name} has joined the chat.`
            );
            this.sendMessage(
              process.env.FACILITATOR_ROOM_ID,
              `${member.name} joined the chat (Room ID: ${member.roomId})`
            );
            this.uninviteFacilitators(member.roomId);
            if (process.env.CAPTURE_TRANSCRIPTS) {
              const currentDate = new Date();
              const dateOpts = {
                year: "numeric",
                month: "short",
                day: "numeric"
              };
              const chatDate = currentDate.toLocaleDateString(
                "en-GB",
                dateOpts
              );
              const chatTime = currentDate.toLocaleTimeString("en-GB", {
                timeZone: "America/New_York"
              });
              const filename = `${chatDate} - ${chatTime} - ${member.roomId}.txt`;
              const filepath = path.resolve(path.join("transcripts", filename));
              this.activeChatrooms[member.roomId].transcriptFile = filepath;
            }
          }

          if (
            member.membership === "leave" &&
            member.userId !== process.env.BOT_USERID &&
            this.activeChatrooms[member.roomId] &&
            member.userId === this.activeChatrooms[member.roomId].facilitator
          ) {
            this.sendMessage(
              member.roomId,
              `${member.name} has left the chat.`
            );
          }
        });

        if (process.env.CAPTURE_TRANSCRIPTS) {
          // encrypted messages
          this.client.on("Event.decrypted", (event, err) => {
            if (err) {
              return logger.log("error", `ERROR DECRYPTING EVENT: ${err}`);
            }
            if (event.getType() === "m.room.message") {
              this.writeToTranscript(event);
            }
          });
          // unencrypted messages
          this.client.on("Room.timeline", (event, room, toStartOfTimeline) => {
            if (
              event.getType() === "m.room.message" &&
              !this.client.isCryptoEnabled()
            ) {
              if (event.isEncrypted()) {
                return;
              }
              this.writeToTranscript(event);
            }
          });
        }
      })
      .then(() => this.client.startClient({ initialSyncLimit: 0 }))
      .catch(err => {
        this.handleBotCrash(undefined, err);
        logger.log("error", `ERROR INITIALIZING CLIENT: ${err}`);
      });
  }
}

const bot = new OcrccBot();
bot.start();
