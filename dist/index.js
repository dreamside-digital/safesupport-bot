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

            break;
        }
      });
    }
  }, {
    key: "inviteFacilitators",
    value: function inviteFacilitators(roomId) {
      var _this2 = this;

      this.awaitingFacilitator[roomId] = true;
      var chatOffline = true;
      this.client.getJoinedRoomMembers(process.env.FACILITATOR_ROOM_ID).then(function (members) {
        var onlineMembersCount = 0;
        Object.keys(members["joined"]).forEach(function (member) {
          var user = _this2.client.getUser(member);

          if (user.presence === "online" && member !== process.env.BOT_USERID) {
            _logger["default"].log("info", "INVITING MEMBER: " + member);

            chatOffline = false;

            _this2.client.invite(roomId, member)["catch"](function (err) {
              return _logger["default"].log("error", "ERROR INVITING MEMBER: ".concat(err));
            });
          }
        });
      }).then(function () {
        if (chatOffline) {
          _this2.sendMessage(roomId, process.env.CHAT_OFFLINE_MESSAGE);
        }
      })["catch"](function (err) {
        _logger["default"].log("error", "ERROR GETTING ROOM MEMBERS: ".concat(err));
      });
    }
  }, {
    key: "uninviteFacilitators",
    value: function uninviteFacilitators(roomId) {
      var _this3 = this;

      this.awaitingFacilitator[roomId] = false;
      this.client.getJoinedRoomMembers(process.env.FACILITATOR_ROOM_ID).then(function (allFacilitators) {
        _this3.client.getJoinedRoomMembers(roomId).then(function (roomMembers) {
          var membersIds = Object.keys(roomMembers["joined"]);
          var facilitatorsIds = Object.keys(allFacilitators["joined"]);
          facilitatorsIds.forEach(function (f) {
            if (!membersIds.includes(f)) {
              _logger["default"].log("info", "kicking out " + f + " from " + roomId);

              _this3.client.kick(roomId, f, "A facilitator has already joined this chat.").then(function () {
                _logger["default"].log("info", "Kick success");
              })["catch"](function (err) {
                _logger["default"].log("error", "ERROR UNINVITING ROOM MEMBERS: ".concat(err));
              });
            }
          });
        });
      })["catch"](function (err) {
        return _logger["default"].log("error", err);
      });
    }
  }, {
    key: "start",
    value: function start() {
      var _this4 = this;

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
        _this4.client = matrix.createClient(opts);
      })["catch"](function (err) {
        _logger["default"].log("error", "ERROR WITH LOGIN: ".concat(err));
      }).then(function () {
        return _this4.client.initCrypto();
      })["catch"](function (err) {
        return _logger["default"].log("error", "ERROR STARTING CRYPTO: ".concat(err));
      }).then(function () {
        return _this4.client.getJoinedRooms().then(function (data) {
          _this4.joinedRooms = data["joined_rooms"];
        });
      }).then(function () {
        // Automatically accept all room invitations
        _this4.client.on("RoomMember.membership", function (event, member) {
          if (member.membership === "invite" && member.userId === process.env.BOT_USERID && !_this4.joinedRooms.includes(member.roomId)) {
            _logger["default"].log("info", "Auto-joining room " + member.roomId);

            _this4.client.joinRoom(member.roomId).then(function (room) {
              _this4.sendMessage(process.env.FACILITATOR_ROOM_ID, "A support seeker requested a chat (Room ID: ".concat(member.roomId, ")"));
            }).then(function () {
              return _this4.inviteFacilitators(member.roomId);
            })["catch"](function (err) {
              _logger["default"].log("error", err);
            });
          } // When a facilitator joins a support session, revoke the other invitations


          if (member.membership === "join" && member.userId !== process.env.BOT_USERID && _this4.awaitingFacilitator[member.roomId]) {
            _this4.activeChatrooms[member.roomId] = {
              facilitator: member.userId
            };

            _this4.sendMessage(member.roomId, "".concat(member.name, " has joined the chat."));

            _this4.sendMessage(process.env.FACILITATOR_ROOM_ID, "".concat(member.name, " joined the chat (Room ID: ").concat(member.roomId, ")"));

            _this4.uninviteFacilitators(member.roomId);
          }

          if (member.membership === "leave" && member.userId !== process.env.BOT_USERID && _this4.activeChatrooms[member.roomId] && member.userId === _this4.activeChatrooms[member.roomId].facilitator) {
            _this4.sendMessage(member.roomId, "".concat(member.name, " has left the chat."));
          }
        });
      }).then(function () {
        return _this4.client.startClient({
          initialSyncLimit: 0
        });
      })["catch"](function (err) {
        return _logger["default"].log("error", "ERROR INITIALIZING CLIENT: ".concat(err));
      });
    }
  }]);

  return OcrccBot;
}();

var bot = new OcrccBot();
bot.start();