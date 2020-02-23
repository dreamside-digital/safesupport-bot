const path = require("path")
const fs = require("fs")
const os = require("os")
const util = require("util")

const config = require('config');
const winston = require('winston');
const uuid = require('uuidv4').uuid;
const LocalStorage = require('node-localstorage').LocalStorage;
global.Olm = require('olm');
const matrix = require('matrix-js-sdk');
const ENCRYPTION_CONFIG = { "algorithm": "m.megolm.v1.aes-sha2" };

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with level `error` and below to `error.log`
    // - Write all logs with level `info` and below to `combined.log`
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const homeserverUrl = 'https://matrix.rhok.space'
const accessToken = 'MDAxOGxvY2F0aW9uIHJob2suc3BhY2UKMDAxM2lkZW50aWZpZXIga2V5CjAwMTBjaWQgZ2VuID0gMQowMDI3Y2lkIHVzZXJfaWQgPSBAaGVscC1ib3Q6cmhvay5zcGFjZQowMDE2Y2lkIHR5cGUgPSBhY2Nlc3MKMDAyMWNpZCBub25jZSA9IGZBOCsjWWQ4MF9LeTssaF8KMDAyZnNpZ25hdHVyZSA370YUvuoVD3r08AwdgGV9sE0aNWBRTrKvB1me8Bm0tQo'
const botName = 'Help Bot'
const username = 'help-bot'
const password = 'ocrccdemo'
const userId = "@help-bot:rhok.space"

let awaitingAgreement = {}

let client = matrix.createClient(homeserverUrl)

let localStorage = global.localStorage;
  if (typeof localStorage === "undefined" || localStorage === null) {
    const storageLoc = `matrix-chatbot-${username}`
    const dir = path.resolve(path.join(os.homedir(), ".local-storage"))
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const localStoragePath = path.resolve(path.join(dir, storageLoc))
    localStorage = new LocalStorage(localStoragePath);
  }

let deviceId = localStorage.getItem('deviceId')

const sendMessage = (client, roomId, msgText) => {
  client.sendTextMessage(roomId, msgText)
  .then((res) => {
    logger.log('info', "Message sent")
    logger.log('info', res)
  })
  .catch((err) => {
    logger.log('error', "Error sending message");
    logger.log('error', err);
    switch (err["name"]) {
      case "UnknownDeviceError":
        Object.keys(err.devices).forEach((userId) => {
          Object.keys(err.devices[userId]).map((deviceId) => {
              client.setDeviceVerified(userId, deviceId, true);
          });
        });
        sendMessage(client, roomId, msgText)
        break;
      default:
        // logger.log('error', err);
        break;
    }
  })
}

const notifyFacilitators = (client, roomId) => {

}

client.login('m.login.password', {
  user: username,
  password: password,
  initial_device_display_name: botName,
  deviceId: deviceId,
})
.then((data) => {
  const accessToken = data.access_token
  const deviceId = data.device_id

  localStorage.setItem('deviceId', data.device_id)
  // create new client with full options

  let opts = {
    baseUrl: homeserverUrl,
    accessToken: accessToken,
    userId: userId,
    deviceId: deviceId,
    sessionStore: new matrix.WebStorageSessionStore(localStorage),
  }

  client = matrix.createClient(opts)
})
.catch(err => {
  logger.log('error', `Login error: ${err}`)
})
.then(() => client.initCrypto())
.then(() => {

  // Automatically join all room invitations
  client.on("RoomMember.membership", (event, member) => {
    if (member.membership === "invite" && member.userId === userId) {
      client.joinRoom(member.roomId)
      .then(() => client.setRoomEncryption(member.roomId, ENCRYPTION_CONFIG))
      .then(() => {
        sendMessage(client, member.roomId, 'Do you want to continue?')
        awaitingAgreement[member.roomId] = true
      })
    }
  });

  client.on('Event.decrypted', (event) => {
    if (event.getType() === 'm.room.message') {
      const roomId = event.getRoomId()
      const sender = event.getSender()
      const content = event.getContent()
      const body = content.body

      if (sender !== userId && awaitingAgreement[roomId]) {
        if (body.toLowerCase().startsWith('yes')) {
          sendMessage(client, roomId, "A facilitator will be with you soon.")
          notifyFacilitators(client, roomId)
          awaitingAgreement[roomId] = false
        } else {
          sendMessage(client, roomId, "Ok, bye")
          awaitingAgreement[roomId] = false
        }
      }
    }
  });
})
.finally(() => client.startClient())

