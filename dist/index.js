"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

var fs = _interopRequireWildcard(require("fs"));

var os = _interopRequireWildcard(require("os"));

var path = _interopRequireWildcard(require("path"));

var util = _interopRequireWildcard(require("util"));

var _nodeLocalstorage = require("node-localstorage");

var matrix = _interopRequireWildcard(require("matrix-js-sdk"));

var _logger = _interopRequireDefault(require("./logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { "default": obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

global.Olm = require("olm");
var ENCRYPTION_CONFIG = {
  algorithm: "m.megolm.v1.aes-sha2"
};
var KICK_REASON = "A facilitator has already joined this chat.";
var BOT_ERROR_MESSAGE = "Something went wrong on our end, please restart the chat and try again.";
var MAX_RETRIES = 3;

var OcrccBot =
/*#__PURE__*/
function () {
  function OcrccBot() {
    _classCallCheck(this, OcrccBot);

    this.awaitingFacilitator = {};
    this.client = matrix.createClient(process.env.MATRIX_SERVER_URL);
    this.joinedRooms = [];
    this.activeChatrooms = {};
  }

  _createClass(OcrccBot, [{
    key: "createLocalStorage",
    value: function createLocalStorage() {
      var storageLoc = "matrix-chatbot-".concat(process.env.BOT_USERNAME);
      var dir = path.resolve(path.join(os.homedir(), ".local-storage"));

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }

      var localStoragePath = path.resolve(path.join(dir, storageLoc));
      return new _nodeLocalstorage.LocalStorage(localStoragePath);
    }
  }, {
    key: "sendMessage",
    value: function sendMessage(roomId, msgText) {
      var _this = this;

      return this.client.sendTextMessage(roomId, msgText)["catch"](function (err) {
        switch (err["name"]) {
          case "UnknownDeviceError":
            Object.keys(err.devices).forEach(function (userId) {
              Object.keys(err.devices[userId]).map(function (deviceId) {
                _this.client.setDeviceVerified(userId, deviceId, true);
              });
            });
            return _this.sendMessage(roomId, msgText);
            break;

          default:
            _logger["default"].log("error", "ERROR SENDING MESSAGE: ".concat(err));

            _this.handleBotCrash(roomId, err);

            break;
        }
      });
    }
  }, {
    key: "inviteUserToRoom",
    value: function inviteUserToRoom(client, roomId, member) {
      var _this2 = this;

      var retries = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

      _logger["default"].log("info", "INVITING MEMBER: " + member);

      if (retries > MAX_RETRIES) {
        this.handleBotCrash(roomId, "Rate limit exceeded for bot account");
        return _logger["default"].log("error", "RATE LIMIT EXCEEDED AND RETRY LIMIT EXCEEDED");
      }

      return client.invite(roomId, member)["catch"](function (err) {
        switch (err["name"]) {
          case "M_LIMIT_EXCEEDED":
            _logger["default"].log("info", "Rate limit exceeded, retrying.");

            var retryCount = retries + 1;
            var delay = retryCount * 2 * 1000;
            return setTimeout(_this2.inviteUserToRoom, delay, client, roomId, member, retryCount);
            break;

          default:
            _logger["default"].log("error", "ERROR INVITING MEMBER: ".concat(err));

            _this2.handleBotCrash(roomId, err);

            break;
        }
      });
    }
  }, {
    key: "kickUserFromRoom",
    value: function kickUserFromRoom(client, roomId, member) {
      var _this3 = this;

      var retries = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

      _logger["default"].log("info", "KICKING OUT MEMBER: " + member);

      if (retries > MAX_RETRIES) {
        this.handleBotCrash(roomId, "Rate limit exceeded for bot account.");
        return _logger["default"].log("error", "RATE LIMIT EXCEEDED AND RETRY LIMIT EXCEEDED");
      }

      return client.kick(roomId, member, KICK_REASON)["catch"](function (err) {
        switch (err["name"]) {
          case "M_LIMIT_EXCEEDED":
            _logger["default"].log("info", "Rate limit exceeded, retrying.");

            var retryCount = retries + 1;
            var delay = retryCount * 2 * 1000;
            return setTimeout(_this3.kickUserFromRoom, delay, client, roomId, member, retryCount);
            break;

          default:
            _this3.handleBotCrash(roomId, err);

            _logger["default"].log("error", "ERROR KICKING OUT MEMBER: ".concat(err));

            break;
        }
      });
    }
  }, {
    key: "inviteFacilitators",
    value: function inviteFacilitators(roomId) {
      var _this4 = this;

      this.awaitingFacilitator[roomId] = true;
      var chatOffline = true;
      this.client.getJoinedRoomMembers(process.env.FACILITATOR_ROOM_ID).then(function (members) {
        var onlineMembersCount = 0;
        Object.keys(members["joined"]).forEach(function (member) {
          var user = _this4.client.getUser(member);

          if (user.presence === "online" && member !== process.env.BOT_USERID) {
            chatOffline = false;

            _this4.inviteUserToRoom(_this4.client, roomId, member);
          }
        });
      }).then(function () {
        if (chatOffline) {
          _this4.sendMessage(roomId, process.env.CHAT_OFFLINE_MESSAGE);
        }
      })["catch"](function (err) {
        _this4.handleBotCrash(roomId, err);

        _logger["default"].log("error", "ERROR GETTING ROOM MEMBERS: ".concat(err));
      });
    }
  }, {
    key: "uninviteFacilitators",
    value: function uninviteFacilitators(roomId) {
      var _this5 = this;

      this.awaitingFacilitator[roomId] = false;
      this.client.getJoinedRoomMembers(process.env.FACILITATOR_ROOM_ID).then(function (allFacilitators) {
        _this5.client.getJoinedRoomMembers(roomId).then(function (roomMembers) {
          var membersIds = Object.keys(roomMembers["joined"]);
          var facilitatorsIds = Object.keys(allFacilitators["joined"]);
          facilitatorsIds.forEach(function (f) {
            if (!membersIds.includes(f)) {
              _this5.kickUserFromRoom(_this5.client, roomId, f);
            }
          });
        });
      })["catch"](function (err) {
        _this5.handleBotCrash(roomId, err);

        _logger["default"].log("error", err);
      });
    }
  }, {
    key: "handleBotCrash",
    value: function handleBotCrash(roomId, error) {
      if (roomId) {
        this.sendMessage(roomId, BOT_ERROR_MESSAGE);
      }

      this.sendMessage(process.env.FACILITATOR_ROOM_ID, "The Help Bot ran into an error: ".concat(error, ". Please verify that the chat service is working."));
    }
  }, {
    key: "writeToTranscript",
    value: function writeToTranscript(event) {
      try {
        var sender = event.getSender();
        var roomId = event.getRoomId();
        var content = event.getContent();
        var date = event.getDate();
        var time = date.toLocaleTimeString("en-GB", {
          timeZone: "America/New_York"
        });
        var filepath = this.activeChatrooms[roomId].transcriptFile;

        if (!content) {
          return;
        }

        var message = "".concat(sender, " [").concat(time, "]: ").concat(content.body, "\n");
        fs.appendFileSync(filepath, message, "utf8");
      } catch (err) {
        _logger["default"].log("error", "ERROR APPENDING TO TRANSCRIPT FILE: ".concat(err));
      }
    }
  }, {
    key: "start",
    value: function start() {
      var _this6 = this;

      var localStorage = this.createLocalStorage();
      this.client.login("m.login.password", {
        user: process.env.BOT_USERNAME,
        password: process.env.BOT_PASSWORD,
        initial_device_display_name: process.env.BOT_DISPLAY_NAME
      }).then(function (data) {
        var accessToken = data.access_token;
        var deviceId = data.device_id; // create new client with full options

        var opts = {
          baseUrl: process.env.MATRIX_SERVER_URL,
          accessToken: accessToken,
          userId: process.env.BOT_USERID,
          deviceId: deviceId,
          sessionStore: new matrix.WebStorageSessionStore(localStorage)
        };
        _this6.client = matrix.createClient(opts);
      })["catch"](function (err) {
        _logger["default"].log("error", "ERROR WITH LOGIN: ".concat(err));
      }).then(function () {
        _this6.client.getDevices().then(function (data) {
          var currentDeviceId = _this6.client.getDeviceId();

          var allDeviceIds = data.devices.map(function (d) {
            return d.device_id;
          });
          var oldDevices = allDeviceIds.filter(function (id) {
            return id !== currentDeviceId;
          });

          _logger["default"].log("info", "DELETING OLD DEVICES: ".concat(oldDevices));

          _this6.client.deleteMultipleDevices(oldDevices)["catch"](function (err) {
            var auth = {
              session: err.data.session,
              type: "m.login.password",
              user: process.env.BOT_USERID,
              identifier: {
                type: "m.id.user",
                user: process.env.BOT_USERID
              },
              password: process.env.BOT_PASSWORD
            };

            _this6.client.deleteMultipleDevices(oldDevices, auth).then(function () {
              return _logger["default"].log("info", "DELETED OLD DEVICES");
            })["catch"](function (err) {
              return _logger["default"].log("error", "ERROR DELETING OLD DEVICES: ".concat(JSON.stringify(err.data)));
            });
          });
        });
      }).then(function () {
        return _this6.client.initCrypto();
      })["catch"](function (err) {
        return _logger["default"].log("error", "ERROR STARTING CRYPTO: ".concat(err));
      }).then(function () {
        return _this6.client.getJoinedRooms().then(function (data) {
          _this6.joinedRooms = data["joined_rooms"];
        });
      }).then(function () {
        // Automatically accept all room invitations
        _this6.client.on("RoomMember.membership", function (event, member) {
          if (member.membership === "invite" && member.userId === process.env.BOT_USERID && !_this6.joinedRooms.includes(member.roomId)) {
            _logger["default"].log("info", "Auto-joining room " + member.roomId);

            _this6.client.joinRoom(member.roomId).then(function (room) {
              _this6.sendMessage(process.env.FACILITATOR_ROOM_ID, "A support seeker requested a chat (Room ID: ".concat(member.roomId, ")"));
            }).then(function () {
              return _this6.inviteFacilitators(member.roomId);
            })["catch"](function (err) {
              _logger["default"].log("error", err);
            });
          } // When a facilitator joins a support session, revoke the other invitations


          if (member.membership === "join" && member.userId !== process.env.BOT_USERID && _this6.awaitingFacilitator[member.roomId]) {
            _this6.activeChatrooms[member.roomId] = {
              facilitator: member.userId
            };

            _this6.sendMessage(member.roomId, "".concat(member.name, " has joined the chat."));

            _this6.sendMessage(process.env.FACILITATOR_ROOM_ID, "".concat(member.name, " joined the chat (Room ID: ").concat(member.roomId, ")"));

            _this6.uninviteFacilitators(member.roomId);

            if (process.env.CAPTURE_TRANSCRIPTS) {
              var currentDate = new Date();
              var dateOpts = {
                year: "numeric",
                month: "short",
                day: "numeric"
              };
              var chatDate = currentDate.toLocaleDateString("en-GB", dateOpts);
              var chatTime = currentDate.toLocaleTimeString("en-GB", {
                timeZone: "America/New_York"
              });
              var filename = "".concat(chatDate, " - ").concat(chatTime, " - ").concat(member.roomId, ".txt");
              var filepath = path.resolve(path.join("transcripts", filename));
              _this6.activeChatrooms[member.roomId].transcriptFile = filepath;
            }
          }

          if (member.membership === "leave" && member.userId !== process.env.BOT_USERID && _this6.activeChatrooms[member.roomId] && member.userId === _this6.activeChatrooms[member.roomId].facilitator) {
            _this6.sendMessage(member.roomId, "".concat(member.name, " has left the chat."));
          }
        });

        if (process.env.CAPTURE_TRANSCRIPTS) {
          // encrypted messages
          _this6.client.on("Event.decrypted", function (event, err) {
            if (err) {
              return _logger["default"].log("error", "ERROR DECRYPTING EVENT: ".concat(err));
            }

            if (event.getType() === "m.room.message") {
              _this6.writeToTranscript(event);
            }
          }); // unencrypted messages


          _this6.client.on("Room.timeline", function (event, room, toStartOfTimeline) {
            if (event.getType() === "m.room.message" && !_this6.client.isCryptoEnabled()) {
              if (event.isEncrypted()) {
                return;
              }

              _this6.writeToTranscript(event);
            }
          });
        }
      }).then(function () {
        return _this6.client.startClient({
          initialSyncLimit: 0
        });
      })["catch"](function (err) {
        _this6.handleBotCrash(undefined, err);

        _logger["default"].log("error", "ERROR INITIALIZING CLIENT: ".concat(err));
      });
    }
  }]);

  return OcrccBot;
}();

var bot = new OcrccBot();
bot.start();