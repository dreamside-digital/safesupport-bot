require('dotenv').config()

import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import waitForExpect from 'wait-for-expect'

import {
  createClient,
  WebStorageSessionStore,
  mockClient,
  mockRegisterRequest,
  mockInitCrypto,
  mockStartClient,
  mockSetPowerLevel,
  mockCreateRoom,
  mockLeave,
  mockDeactivateAccount,
  mockStopClient,
  mockClearStores,
  mockOn,
  mockOnce,
  mockSendMessage,
  mockSendTextMessage,
  mockLogin,
  mockGetDevices,
  mockGetDeviceId,
  mockDeleteMultipleDevices,
  mockGetJoinedRooms,
  mockSetDeviceVerified,
  mockInvite,
  mockKick,
  mockGetJoinedRoomMembers,
  mockGetUser,
  mockGetGroupUsers
} from "matrix-js-sdk";

import MatrixBot from './bot'

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


const mockAppendFileSync = jest.fn()
fs.appendFileSync = mockAppendFileSync

describe('MatrixBot', () => {
  beforeEach(() => {
    createClient.mockClear()
    mockInitCrypto.mockClear()
    mockStartClient.mockClear()
    mockRegisterRequest.mockClear()
    mockSetPowerLevel.mockClear()
    mockCreateRoom.mockClear()
    mockLeave.mockClear()
    mockDeactivateAccount.mockClear()
    mockStopClient.mockClear()
    mockClearStores.mockClear()
    mockOnce.mockClear()
    mockOn.mockClear()
    mockLogin.mockClear()
    mockGetDevices.mockClear()
    mockGetDeviceId.mockClear()
    mockDeleteMultipleDevices.mockClear()
    mockGetJoinedRooms.mockClear()
    mockSetDeviceVerified.mockClear()
    mockInvite.mockClear()
    mockKick.mockClear()
    mockGetJoinedRoomMembers.mockClear()
    mockGetUser.mockClear()
    mockSendMessage.mockClear()
    mockSendTextMessage.mockClear()
    mockAppendFileSync.mockClear()
    mockGetGroupUsers.mockClear()
  })


  test('constructor should inititialize class variables', () => {
    const bot = new MatrixBot(botConfig)
    expect(bot.joinedRooms).toEqual([])
  })

  test('#createLocalStorage should have correct storage location', () => {
    const bot = new MatrixBot(botConfig)
    const localStorage = bot.createLocalStorage()
    const localStoragePath = path.resolve(path.join(os.homedir(), ".local-storage", `matrix-chatbot-${process.env.BOT_USERNAME}`));
    expect(localStorage._location).toBe(localStoragePath)
  })

  test('#sendMessage should send a text message', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    const testRoom = 'room_id_1234'
    const testMsg = 'test message'

    bot.sendMessage(testRoom, testMsg)

    waitForExpect(() => {
      expect(mockSetDeviceVerified).toHaveBeenCalledTimes(2)
    })
    waitForExpect(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(testRoom, testMsg)
    })

  })

  test('#inviteUserToRoom should add member to room and retry on rate limit error', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    bot.inviteUserToRoom(bot.client, 'room_id_1234', process.env.BOT_USERNAME)

    waitForExpect(() => {
      expect(mockInvite).toHaveBeenCalledTimes(2)
    })
  })

  test('#kickUserFromRoom should remove member from room and retry on rate limit error', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    bot.kickUserFromRoom(bot.client, 'room_id_1234', process.env.BOT_USERNAME)

    waitForExpect(() => {
      expect(mockKick).toHaveBeenCalledTimes(2)
    })
  })

  test('#inviteFacilitators should invite all members from Facilitator room', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    bot.inviteFacilitators()

    waitForExpect(() => {
      expect(mockGetJoinedRoomMembers).toHaveBeenCalledWith(process.env.FACILITATOR_ROOM_ID)
    })

    waitForExpect(() => {
      expect(mockGetUser).toHaveBeenCalledTimes(2)
    })

    waitForExpect(() => {
      expect(mockInvite).toHaveBeenCalledTimes(2)
    })
  })

  test('#uninviteFacilitators should remove all members that have not accepted the invite', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    bot.uninviteFacilitators()

    waitForExpect(() => {
      expect(mockGetJoinedRoomMembers).toHaveBeenCalledWith(process.env.FACILITATOR_ROOM_ID)
    })

    waitForExpect(() => {
      expect(mockGetJoinedRoomMembers).toHaveBeenCalledWith('room_id_1234')
    })

    waitForExpect(() => {
      expect(mockKick).toHaveBeenCalled()
    })
  })

  test('#handleBotCrash should notify rooms', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    bot.handleBotCrash('test_room_id', 'test error message')

    waitForExpect(() => {
      expect(mockSendTextMessage).toHaveBeenCalledWith('test_room_id', "Something went wrong on our end, please restart the chat and try again.")
    })

    waitForExpect(() => {
      expect(mockSendTextMessage).toHaveBeenCalledWith(process.env.FACILITATOR_ROOM_ID, `The Help Bot ran into an error: test error message. Please verify that the chat service is working.`)
    })
  })

  test('#writeToTranscript should parse event and write to transcript file', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    bot.localStorage.setItem(`test_room_id-transcript`, '__mocks__/test_transcript.txt')

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    const mockEvent = {
      getSender: () => 'test_sender',
      getRoomId: () => 'test_room_id',
      getContent: () => { return { body: 'test content' }},
      getDate: () => { return new Date(2020,2,17,0,0,0,0) }
    }

    bot.writeToTranscript(mockEvent)

    waitForExpect(() => {
      expect(mockAppendFileSync).toHaveBeenCalledWith('__mocks__/test_transcript.txt', 'test_sender [00:00:00]: test content', 'utf8')
    })
  })

  test('#deleteOldDevices should delete old sessions', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })

    bot.deleteOldDevices()

    waitForExpect(() => {
      expect(mockGetDevices).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockGetDevicdId).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(deleteMultipleDevices).toHaveBeenCalled()
    })
  })

  // TODO test listeners for membership events and message events

  test('#start should start bot and set up listeners', () => {
    const bot = new MatrixBot(botConfig)
    bot.start()

    waitForExpect(() => {
      expect(mockLogin).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(WebStorageSessionStore).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(createClient).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockGetDevices).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockGetDeviceId).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockDeleteMultipleDevices).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockInitCrypto).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockGetJoinedRooms).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockOn).toHaveBeenCalled()
    })

    waitForExpect(() => {
      expect(mockStartClient).toHaveBeenCalled()
    })
  })
})