import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { LocalStorage } from "node-localstorage";

global.Olm = require("olm");

import * as matrix from "matrix-js-sdk";

import logger from "./logger";


class MatrixBot {
  constructor(botConfig) {
    this.config = botConfig
    this.client = matrix.createClient(this.config.MATRIX_SERVER_URL);
    this.joinedRooms = [];
  }

  createLocalStorage() {
    const storageLoc = `matrix-chatbot-${this.config.BOT_USERNAME}`;
    const dir = path.resolve(path.join(os.homedir(), ".local-storage"));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const localStoragePath = path.resolve(path.join(dir, storageLoc));
    return new LocalStorage(localStoragePath);
  }

  sendTextMessage(roomId, msgText, showToUser = null) {
    const content = {
      msgtype: "m.text",
      body: msgText,
      showToUser: showToUser
    };

    this.sendMessage(roomId, content);
  }


  async sendNotice(roomId, message) {
    logger.log("info", `SENDING *NOTICE*: ${message}`)
    try {
      await this.client.sendNotice(roomId, message)
    } catch(err) {
      switch (err["name"]) {
        case "UnknownDeviceError":
          Object.keys(err.devices).forEach(userId => {
            Object.keys(err.devices[userId]).map(async deviceId => {
              try {
                await this.client.setDeviceVerified(userId, deviceId, true);
              } catch(err) {
                logger.log("error", `ERROR VERIFYING DEVICE: ${err}`);
              }
            });
          });
          await this.sendNotice(roomId, message);
        default:
          logger.log("error", `ERROR SENDING *NOTICE*: ${err}`);
          break;
      }
    }
  }

  async sendMessage(roomId, content) {
    logger.log("info", `SENDING MESSAGE: ${content.body}`)
    try {
      await this.client.sendMessage(roomId, content)
    } catch(err) {
      switch (err["name"]) {
        case "UnknownDeviceError":
          Object.keys(err.devices).forEach(userId => {
            Object.keys(err.devices[userId]).map(async deviceId => {
              try {
                await this.client.setDeviceVerified(userId, deviceId, true);
              } catch(err) {
                logger.log("error", `ERROR VERIFYING DEVICE: ${err}`);
              }
            });
          });
          await this.sendMessage(roomId, content);
        default:
          logger.log("error", `ERROR SENDING MESSAGE: ${err}`);
          break;
      }
    }
  }

  inviteUserToRoom(roomId, member) {
    try {
      this.client.invite(roomId, member)
    } catch(err) {
      this.handleBotCrash(roomId, err);
    }
  }

  kickUserFromRoom(roomId, member) {
    try {
      this.client.kick(roomId, member, this.config.KICK_REASON)
    } catch(err) {
      this.handleBotCrash(roomId, err);
      logger.log("error", `ERROR KICKING OUT MEMBER: ${err}`);
    }
  }

  async inviteFacilitators(roomId) {
    this.localStorage.setItem(`${roomId}-waiting`, 'true')
    let chatOffline = true;

    try {
      const data = await this.client.getGroupUsers(this.config.FACILITATOR_GROUP_ID)
      const members = data.chunk

      members.forEach(member => {
        const memberId = member.user_id;
        const user = this.client.getUser(memberId);
        if (
          user &&
          user.presence === "online" &&
          memberId !== this.config.BOT_USERID
        ) {
          chatOffline = false;
          this.inviteUserToRoom(roomId, memberId);
        }
      });

      if (chatOffline) {
        logger.log('info', "NO FACILITATORS ONLINE")
        this.sendTextMessage(roomId, this.config.CHAT_OFFLINE_MESSAGE);
        this.sendNotice(roomId, "Chat is offline")
      }

    } catch(err) {
      this.handleBotCrash(roomId, err);
      logger.log("error", `ERROR GETTING FACILITATORS: ${err}`);
    }
  }


  async uninviteFacilitators(roomId) {
    this.localStorage.removeItem(`${roomId}-waiting`)

    try {
      const groupUsers = await this.client.getGroupUsers(this.config.FACILITATOR_GROUP_ID)
      const roomMembers = await this.client.getJoinedRoomMembers(roomId)

      const roomMemberIds = Object.keys(roomMembers["joined"]);
      const groupMemberIds = groupUsers["chunk"]

      if (!roomMemberIds || !groupMemberIds) return;

      const facilitatorsIds = groupMemberIds.map(f => f.user_id);

      facilitatorsIds.forEach(f => {
        if (!roomMemberIds.includes(f)) {
          this.kickUserFromRoom(roomId, f);
        }
      });
    } catch(err) {
      this.handleBotCrash(roomId, err);
      logger.log("ERROR UNINVITING FACILITATORS", err);
    }
  }

  handleBotCrash(roomId, error) {
    if (roomId) {
      this.sendTextMessage(roomId, this.config.BOT_ERROR_MESSAGE);
    }

    this.sendTextMessage(
      this.config.FACILITATOR_ROOM_ID,
      `The Help Bot ran into an error: ${error}. Please verify that the chat service is working.`
    );
  }

  handleMessageEvent(event) {
    const content = event.getContent();

    // do nothing if there's no content
    if (!content) {
      return;
    }

    // bot commands
    if (content.body.startsWith("!bot")) {
      return this.handleBotCommand(event);
    }

    // write to transcript
    if (this.config.CAPTURE_TRANSCRIPTS) {
      return this.writeToTranscript(event);
    }
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
      const filepath = this.localStorage.getItem(`${roomId}-transcript`)

      if (!filepath) {
        return logger.log("error", `NO TRANSCRIPT FILE FOR ROOM: ${roomId}`);
      }

      const message = `${sender} [${time}]: ${content.body}\n`;

      fs.appendFileSync(filepath, message, "utf8");
    } catch (err) {
      logger.log("error", `ERROR APPENDING TO TRANSCRIPT FILE: ${err}`);
    }
  }

  handleBotCommand(event) {
    try {
      const senderId = event.getSender();
      const roomId = event.getRoomId();
      const content = event.getContent();
      const command = content.body.substring("!bot".length).trim();

      switch (command) {
        case "transcript":
          this.sendTranscript(senderId, roomId);
          break;
        case "transcript please":
          this.sendTranscript(senderId, roomId);
          break;
        case "hi":
          const responses = [
            "Hi!",
            "Hello",
            "Hey :)",
            "Hi there",
            "Bleep bloop"
          ];
          const message =
            responses[Math.floor(Math.random() * responses.length)];
          this.sendTextMessage(roomId, message, senderId);
          break;
        default:
          this.sendTextMessage(
            roomId,
            `Sorry, I don't know that command. I'm not a very smart bot.`,
            senderId
          );
          break;
      }
    } catch (err) {
      logger.log("error", `ERROR EXECUTING BOT COMMAND: ${err}`);
    }
  }

  async leaveEmptyRooms(senderId) {
    try {
      const roomData = await this.client.getJoinedRooms()
      const joinedRoomsIds = roomData["joined_rooms"]
      joinedRoomsIds.forEach(async roomId => {
        const room = this.client.getRoom(roomId)
        if (room && room.getJoinedMemberCount() === 1) {
          try {
            logger.log('info', "LEAVING EMPTY ROOM => " + roomId)
            await this.client.leave(roomId)
          } catch(err) {
            logger.log('error', "ERROR LEAVING EMPTY ROOM => " + err)
          }
        }
      })
    } catch(err) {
      logger.log("error", `ERROR GETTING JOINED ROOMS: ${err}`);
    }
  }

  async sendTranscript(senderId, roomId) {
    try {
      const transcriptFile = this.localStorage.getItem(`${roomId}-transcript`)

      if (!transcriptFile) {
        this.sendTextMessage(
          roomId,
          "There is no transcript for this chat.",
          senderId
        );
      }

      const filename = path.basename(transcriptFile) || "Transcript";
      const stream = fs.createReadStream(transcriptFile);

      const contentUrl = await this.client.uploadContent({
        stream: stream,
        name: filename
      })

      const content = {
        msgtype: "m.file",
        body: filename,
        url: JSON.parse(contentUrl).content_uri,
        showToUser: senderId
      };

      this.sendMessage(roomId, content);
    } catch(err) {
      logger.log("error", `ERROR UPLOADING CONTENT: ${err}`);
      this.sendTextMessage(
        roomId,
        "There was an error uploading the transcript.",
        senderId
      );
    }
  }

  async deleteOldDevices() {
    const currentDeviceId = this.client.getDeviceId();
    const deviceData = await this.client.getDevices()
    const allDeviceIds = deviceData.devices.map(d => d.device_id)
    const oldDevices = allDeviceIds.filter(id => id !== currentDeviceId);

    try {
      await this.client.deleteMultipleDevices(oldDevices)
    } catch(err) {
      logger.log("info", "RETRYING DELETE OLD DEVICES WITH AUTH")
      const auth = {
        session: err.data.session,
        type: "m.login.password",
        user: this.config.BOT_USERID,
        identifier: { type: "m.id.user", user: this.config.BOT_USERID },
        password: this.config.BOT_PASSWORD
      };

      await this.client.deleteMultipleDevices(oldDevices, auth)
      logger.log("info", "DELETED OLD DEVICES")
    }
  }

  async trackJoinedRooms() {
    const roomData = await this.client.getJoinedRooms()
    this.joinedRooms = roomData["joined_rooms"]
    logger.log("info", "JOINED ROOMS => " + this.joinedRooms)
  }

  async setMembershipListeners() {
    // Automatically accept all room invitations
    this.client.on("RoomMember.membership", async (event, member) => {
      if (
        member.membership === "invite" &&
        member.userId === this.config.BOT_USERID &&
        !this.joinedRooms.includes(member.roomId)
      ) {
        try {
          const room = await this.client.joinRoom(member.roomId)
          logger.log("info", "AUTO JOINED ROOM => " + room.roomId)
          this.sendTextMessage(
            this.config.FACILITATOR_ROOM_ID,
            `A support seeker requested a chat (Room ID: ${room.roomId})`
          );
          this.inviteFacilitators(room.roomId)
        } catch(err) {
          logger.log("error", "ERROR JOINING ROOM => " + err)
        }
      }

      // When a facilitator joins a support session, make them a moderator
      // revoke the other invitations
      if (
        member.membership === "join" &&
        member.userId !== this.config.BOT_USERID &&
        this.localStorage.getItem(`${member.roomId}-waiting`)
      ) {
        this.localStorage.setItem(`${member.roomId}-facilitator`, member.userId)
        const event = {
          getType: () => {
            return "m.room.power_levels";
          },
          getContent: () => {
            return {
              users: {
                [this.config.BOT_USERID]: 100,
                [member.userId]: 50
              }
            };
          }
        };
        this.client.setPowerLevel(member.roomId, member.userId, 50, event);
        this.sendTextMessage(
          member.roomId,
          `${member.name} has joined the chat.`
        );
        this.sendTextMessage(
          this.config.FACILITATOR_ROOM_ID,
          `${member.name} joined the chat (Room ID: ${member.roomId})`
        );
        this.uninviteFacilitators(member.roomId);
        if (this.config.CAPTURE_TRANSCRIPTS) {
          const currentDate = new Date();
          const dateOpts = {
            year: "numeric",
            month: "short",
            day: "numeric"
          };
          const chatDate = currentDate.toLocaleDateString("en-GB", dateOpts);
          const chatTime = currentDate.toLocaleTimeString("en-GB", {
            timeZone: "America/New_York"
          });
          const filename = `${chatDate} - ${chatTime} - ${member.roomId}.txt`;
          const filepath = path.resolve(path.join("transcripts", filename));
          this.localStorage.setItem(`${member.roomId}-transcript`, filepath)
        }
      }

      if (
        member.membership === "leave" &&
        member.userId !== this.config.BOT_USERID
      ) {
        const facilitatorId = this.localStorage.getItem(`${member.roomId}-facilitator`)
        if (member.userId === facilitatorId) {
          this.sendTextMessage(
            member.roomId,
            `${member.name} has left the chat.`
          );
        }

        // leave if there is nobody in the room
        const room = this.client.getRoom(member.roomId)
        if (!room) return

        const memberCount = room.getJoinedMemberCount()

        if (memberCount === 1) { // just the bot
          logger.log("info", `LEAVING EMPTY ROOM ==> ${member.roomId}`);
          this.client.leave(member.roomId)
          this.localStorage.removeItem(`${member.roomId}-facilitator`)
          this.localStorage.removeItem(`${member.roomId}-transcript`)
        }
      }
    });
  }

  async setMessageListeners() {
    // encrypted messages
    this.client.on("Event.decrypted", (event, err) => {
      if (err) {
        return logger.log("error", `ERROR DECRYPTING EVENT: ${err}`);
      }
      if (event.getType() === "m.room.message") {
        this.handleMessageEvent(event);
      }
    });
    // unencrypted messages
    this.client.on("Room.timeline", (event, room, toStartOfTimeline) => {
      if (event.getType() === "m.room.message" && !event.isEncrypted()) {
        this.handleMessageEvent(event);
      }
    });
  }

  async leaveOldRooms() {
    const roomData = await this.client.getJoinedRooms()

    roomData["joined_rooms"].forEach(async roomId => {
      try {
        await this.client.leave(roomId)
      } catch(err) {
       logger.log('error', "ERROR LEAVING ROOM => " + err)
      }
    })
  }

  async start() {
    const localStorage = this.createLocalStorage();
    this.localStorage = localStorage

    try {
      const auth = {
        user: this.config.BOT_USERNAME,
        password: this.config.BOT_PASSWORD,
        initial_device_display_name: this.config.BOT_DISPLAY_NAME
      }
      const account = await this.client.login("m.login.password", auth)
      logger.log("info", `ACCOUNT ==> ${JSON.stringify(account)}`);

      let opts = {
        baseUrl: this.config.MATRIX_SERVER_URL,
        accessToken: account.access_token,
        userId: this.config.BOT_USERID,
        deviceId: account.device_id,
        sessionStore: new matrix.WebStorageSessionStore(localStorage)
      };

      this.client = matrix.createClient(opts);
      await this.deleteOldDevices()
      await this.trackJoinedRooms()
      await this.client.initCrypto()
      await this.setMembershipListeners();
      await this.setMessageListeners();
      this.client.startClient({ initialSyncLimit: 0 })
    } catch(err) {
      this.handleBotCrash(undefined, err);
      logger.log("error", `ERROR INITIALIZING CLIENT: ${err}`);
    }
  }
}

export default MatrixBot;
