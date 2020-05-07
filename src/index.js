require('dotenv').config()

const ENCRYPTION_CONFIG = { algorithm: "m.megolm.v1.aes-sha2" };
const KICK_REASON = "A facilitator has already joined this chat.";
const BOT_ERROR_MESSAGE =
  "Something went wrong on our end, please restart the chat and try again.";
const MAX_RETRIES = 3;
const {
  MATRIX_SERVER_URL,
  BOT_USERNAME,
  BOT_USERID,
  BOT_PASSWORD,
  BOT_DISPLAY_NAME,
  FACILITATOR_GROUP_ID,
  FACILITATOR_ROOM_ID,
  CHAT_OFFLINE_MESSAGE,
  CAPTURE_TRANSCRIPTS
} = process.env;

const botConfig = {
  ENCRYPTION_CONFIG,
  KICK_REASON,
  BOT_ERROR_MESSAGE,
  MAX_RETRIES,
  MATRIX_SERVER_URL,
  BOT_USERNAME,
  BOT_USERID,
  BOT_PASSWORD,
  BOT_DISPLAY_NAME,
  FACILITATOR_GROUP_ID,
  FACILITATOR_ROOM_ID,
  CHAT_OFFLINE_MESSAGE,
  CAPTURE_TRANSCRIPTS
}

import MatrixBot from './bot'

const bot = new MatrixBot(botConfig);
bot.start();
