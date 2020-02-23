import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as util from 'util'
import { LocalStorage } from "node-localstorage";
import { uuid } from "uuidv4"
import config from 'config';

global.Olm = require('olm');

import * as matrix from "matrix-js-sdk";

import logger from './logger'

const ENCRYPTION_CONFIG = { "algorithm": "m.megolm.v1.aes-sha2" };

class OcrccBot {
  constructor() {
    this.awaitingAgreement = {}
    this.awaitingFacilitator = {}
    this.client = matrix.createClient(config.get('homeserverUrl'))
  }

  createLocalStorage() {
    const storageLoc = `matrix-chatbot-${config.get('username')}`
    const dir = path.resolve(path.join(os.homedir(), ".local-storage"))
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const localStoragePath = path.resolve(path.join(dir, storageLoc))
    return new LocalStorage(localStoragePath);
  }

  sendMessage(roomId, msgText) {
    return this.client.sendTextMessage(roomId, msgText)
      .then((res) => {
        logger.log('info', "Message sent")
        logger.log('info', res)
      })
      .catch((err) => {
        switch (err["name"]) {
          case "UnknownDeviceError":
            Object.keys(err.devices).forEach((userId) => {
              Object.keys(err.devices[userId]).map((deviceId) => {
                  this.client.setDeviceVerified(userId, deviceId, true);
              });
            });
            return this.sendMessage(roomId, msgText)
            break;
          default:
            logger.log('error', "Error sending message");
            logger.log('error', err);
            break;
        }
      })
  }

  sendHtmlMessage(roomId, msgText, msgHtml) {
    return this.client.sendHtmlMessage(roomId, msgText, msgHtml)
      .then((res) => {
        logger.log('info', "Message sent")
        logger.log('info', res)
      })
      .catch((err) => {
        switch (err["name"]) {
          case "UnknownDeviceError":
            Object.keys(err.devices).forEach((userId) => {
              Object.keys(err.devices[userId]).map((deviceId) => {
                  this.client.setDeviceVerified(userId, deviceId, true);
              });
            });
            return this.sendHtmlMessage(roomId, msgText, msgHtml)
            break;
          default:
            logger.log('error', "Error sending message");
            logger.log('error', err);
            break;
        }
      })
  }

  inviteFacilitators(roomId) {
    this.awaitingFacilitator[roomId] = true
    this.client.getJoinedRoomMembers(config.get('waitingRoomId'))
    .then((members) => {
      Object.keys(members["joined"]).forEach((member) => {
        if (member !== config.get('userId'))
        this.client.invite(roomId, member)
      })
    })
    // const notif = `There is a support seeker waiting. Go to https://riot.im/app/#/room/${roomId} to respond.`
    // sendMessage(waitingRoomId, notif)
  }

  uninviteFacilitators(roomId) {
    this.awaitingFacilitator[roomId] = false
    this.client.getJoinedRoomMembers(config.get('waitingRoomId'))
    .then((allFacilitators) => {
      this.client.getJoinedRoomMembers(roomId)
      .then((roomMembers) => {
        const membersIds = Object.keys(roomMembers["joined"])
        const facilitatorsIds = Object.keys(allFacilitators["joined"])
        facilitatorsIds.forEach((f) => {
          if (!membersIds.includes(f)) {
            logger.log("info", "kicking out " + f + " from " + roomId)
            this.client.kick(roomId, f, "A facilitator has already joined this chat.")
            .then(() => {
              logger.log("info", "Kick success")
            })
            .catch((err) => {
              logger.log("error", err)
            })
          }
        })
      })
    })
  }

  start() {
    const localStorage = this.createLocalStorage()
    let deviceId = localStorage.getItem('deviceId')

    this.client.login('m.login.password', {
      user: config.get('username'),
      password: config.get('password'),
      initial_device_display_name: config.get('botName'),
      deviceId: deviceId,
    })
    .then((data) => {
      const accessToken = data.access_token
      const deviceId = data.device_id

      localStorage.setItem('deviceId', data.device_id)

      // create new client with full options

      let opts = {
        baseUrl: config.get('homeserverUrl'),
        accessToken: accessToken,
        userId: config.get('userId'),
        deviceId: deviceId,
        sessionStore: new matrix.WebStorageSessionStore(localStorage),
      }

      this.client = matrix.createClient(opts)
    })
    .catch(err => {
      logger.log('error', `Login error: ${err}`)
    })
    .then(() => this.client.initCrypto())
    .then(() => {

      // Automatically accept all room invitations
      // On joining a room, send the intro messages and wait for agreement to continue
      this.client.on("RoomMember.membership", (event, member) => {
        if (member.membership === "invite" && member.userId === config.get('userId')) {
          logger.log("info", "Auto-joining room " + member.roomId)
          this.client.joinRoom(member.roomId)
          .then(() => this.client.setRoomEncryption(member.roomId, ENCRYPTION_CONFIG))
          .then(() => {
            if (member.roomId !== config.get('waitingRoomId')) {
              this.sendMessage(member.roomId, config.get('introMessage'))
              .then(() => this.sendHtmlMessage(member.roomId, `Please read the terms and conditions at ${config.get('termsUrl')}`, `Please read the full <a href="${config.get('termsUrl')}">terms and conditions</a>.`))
              .then(() => this.sendMessage(member.roomId, config.get('agreementMessage')))
              .then(() => this.awaitingAgreement[member.roomId] = true)
            }
          })
        }

        // When the first facilitator joins a support session, uninvite the other facilitators
        if (member.membership === 'join' && this.awaitingFacilitator[member.roomId]) {
          this.uninviteFacilitators(member.roomId)
        }
      });

      // Listen for incoming messages
      this.client.on('Event.decrypted', (event) => {
        if (event.getType() === 'm.room.message') {
          const roomId = event.getRoomId()
          const sender = event.getSender()
          const content = event.getContent()
          const body = content.body

          // Listen for the user to agree to continue, then invite facilitators to join
          if (sender !== config.get('userId') && this.awaitingAgreement[roomId]) {
            if (body.toLowerCase().startsWith('yes')) {
              this.sendMessage(roomId, config.get('confirmationMessage'))
              this.inviteFacilitators(roomId)
              this.awaitingAgreement[roomId] = false
            } else {
              this.sendMessage(roomId, config.get('exitMessage'))
              this.awaitingAgreement[roomId] = false
            }
          }
        }
      });
    })
    .finally(() => this.client.startClient())

  }

}

const bot = new OcrccBot();
bot.start()
