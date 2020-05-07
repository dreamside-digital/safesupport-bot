export const mockRegisterRequest = jest
  .fn()
  .mockImplementation((params) => {
    if (!params.auth) {
      return Promise.reject({
        data: { session: "session_id_1234" }
      })
    } else {
      return Promise.resolve({
        data: {
          device_id: 'device_id_1234',
          access_token: 'token_1234',
          user_id: 'user_id_1234',
          session: "session_id_1234"
        }
      })
    }
  })

export const mockDeleteMultipleDevices = jest
  .fn()
  .mockImplementation((devices, auth) => {
    if (!auth) {
      return Promise.reject({
        data: { session: "session_id_1234" }
      })
    } else {
      return Promise.resolve({
        data: {
          device_id: 'device_id_1234',
          access_token: 'token_1234',
          user_id: 'user_id_1234',
          session: "session_id_1234"
        }
      })
    }
  })

export const mockLeave = jest.fn(() => {
  return Promise.resolve('value');
});

export const mockInitCrypto = jest.fn()

export const mockStartClient = jest.fn(() => {
  return Promise.resolve('value');
});

export const mockOnce = jest.fn()

export const mockStopClient = jest.fn(() => {
  return Promise.resolve('value');
});

export const mockClearStores = jest.fn(() => {
  return Promise.resolve('value');
});

export const mockGetRoom = jest.fn()

export const mockDownloadKeys = jest.fn()

export const mockSetDeviceVerified = jest.fn()

export const mockIsCryptoEnabled = jest.fn()

export const mockCreateRoom = jest.fn().mockReturnValue({ room_id: 'room_id_1234' })

export const mockSetPowerLevel = jest.fn()

export const mockSendTextMessage = jest.fn()
  .mockImplementationOnce(() => {
    return Promise.reject({
      name: "UnknownDeviceError",
      devices: ['device1', 'device2']
    })
  })
  .mockImplementation(() => {
    return Promise.resolve()
  })

export const mockSendMessage = jest.fn()
  .mockImplementationOnce(() => {
    return Promise.reject({
      name: "UnknownDeviceError",
      devices: ['device1', 'device2']
    })
  })
  .mockImplementation(() => {
    return Promise.resolve()
  })

export const mockSetDeviceKnown = jest.fn()

export const mockInvite = jest.fn()
  .mockImplementationOnce(() => {
    return Promise.reject({
      name: "M_LIMIT_EXCEEDED",
    })
  })
  .mockImplementation(() => {
    return Promise.resolve()
  })

export const mockKick = jest.fn()
  .mockImplementationOnce(() => {
    return Promise.reject({
      name: "M_LIMIT_EXCEEDED",
    })
  })
  .mockImplementation(() => {
    return Promise.resolve()
  })

export const mockDeactivateAccount = jest.fn(() => {
  return Promise.resolve('value');
});

export const mockOn = jest.fn()

export const mockGetDevices = jest.fn(() => {
  return Promise.resolve({
    devices: []
  });
});

export const mockGetDeviceId = jest.fn().mockReturnValue('mockDeviceId');

export const mockGetJoinedRooms = jest.fn(() => {
  return Promise.resolve({
    data: {
      joined_rooms: []
    }
  });
});

export const mockLogin = jest.fn(() => {
  return Promise.resolve({
    data: {
      device_id: 'device_id_1234',
      access_token: 'token_1234',
    }
  })
});

export const mockGetJoinedRoomMembers = jest.fn(() => {
  return Promise.resolve({
    joined: { 'user_id_1': {}, 'user_id_2': {} }
  })
});

export const mockGetGroupUsers = jest.fn(() => {
  return Promise.resolve({
    chunk: [{ user_id: 'user_id_1'}, { user_id: 'user_id_2' }]
  })
});

export const mockGetUser = jest.fn().mockReturnValue({ presence: 'online'});

export const mockClient = {
  registerRequest: mockRegisterRequest,
  initCrypto: mockInitCrypto,
  startClient: mockStartClient,
  on: mockOn,
  once: mockOnce,
  leave: mockLeave,
  stopClient: mockStopClient,
  clearStores: mockClearStores,
  getRoom: mockGetRoom,
  downloadKeys: mockDownloadKeys,
  setDeviceVerified: mockSetDeviceVerified,
  setDeviceKnown: mockSetDeviceKnown,
  isCryptoEnabled: mockIsCryptoEnabled,
  createRoom: mockCreateRoom,
  setPowerLevel: mockSetPowerLevel,
  sendMessage: mockSendMessage,
  sendTextMessage: mockSendTextMessage,
  deactivateAccount: mockDeactivateAccount,
  login: mockLogin,
  getDevices: mockGetDevices,
  getDeviceId: mockGetDeviceId,
  deleteMultipleDevices: mockDeleteMultipleDevices,
  getJoinedRooms: mockGetJoinedRooms,
  invite: mockInvite,
  kick: mockKick,
  getJoinedRoomMembers: mockGetJoinedRoomMembers,
  getUser: mockGetUser,
  getGroupUsers: mockGetGroupUsers,
}

export const WebStorageSessionStore = jest.fn()

export const createClient = jest.fn().mockReturnValue(mockClient)
