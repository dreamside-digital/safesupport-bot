# Safe Support Chat Bot

A simple Matrix bot that handles inviting, uninviting, and notifying Riot users on the recieving end of the [Safe Support chatbox](https://github.com/nomadic-labs/safesupport-chatbox).

The bot can be configured with an `.env` file with the following variables:

```
MATRIX_SERVER_URL=
BOT_DISPLAY_NAME=
BOT_USERNAME=
BOT_PASSWORD=
BOT_USERID=
FACILITATOR_GROUP_ID=
FACILITATOR_ROOM_ID=
CHAT_OFFLINE_MESSAGE=
CAPTURE_TRANSCRIPTS=
```
## What does the bot do?
* The bot receives an invitation to every chatroom created by the embedded chatbox, and automatically accepts
* Upon joining a new room, the bot invites all of the members of the Facilitators community
* When the first facilitator accepts the invitation, the bot uninvites the rest of the facilitators
* The bot notifies the Support Chat Notifications chatroom when there is a support request and when a facilitator joins
* If there are no facilitators online, the bot notifies the support seeker
* The bot makes the facilitator a moderator of the chatroom so they can change the room settings (i.e. room name)
* The bot listens to all the incoming messages and prints them to a transcript if that setting is enabled (`CAPTURE_TRANSCRIPT`)
* Messages that start with `!bot` are treated as commands.
* The bot sends a notification to the support chatroom and the Support Chat Notifications room if it crashes
* On startup, the bot deletes all of the old device IDs for its account

### Bot commands

|Command|Response|
--- | ---
|`!bot hi`|Bot responds with a greeting|
|`!bot transcript`|Bot sends the chat transcript as a .txt file|
|`!bot transcript please`|Bot happily sends the transcript :)|

## Local development
If you prefer to develop locally instead of on Glitch:

Clone the project
```
git clone https://github.com/nomadic-labs/safesupport-bot.git
```

Install dependencies
```
cd safesupport-bot
yarn
```

Copy the sample `.env` file and add in your own variables
```
cp .env.sample .env
```

Start the local server
```
yarn develop
```

Run the tests
```
yarn test
```

Production build
```
yarn build
```

