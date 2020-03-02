# OCRCC Bot

A simple Matrix bot that handles inviting, uninviting, and notifying Riot users on the recieving end of the [OCRCC chatbox](https://github.com/nomadic-labs/ocrcc-chatbox)

A demo of this bot is hosted on Glitch: https://glitch.com/edit/#!/nomadic-labs-ocrcc-bot
You can remix it and continue developing directly on Glitch. All you need to do is add an `.env` file with the following variables:

```
MATRIX_SERVER_URL="https://matrix.org"
BOT_DISPLAY_NAME="Example Bot"
BOT_USERNAME="example-bot"
BOT_PASSWORD="password"
BOT_USERID="@example-bot:matrix.org"
FACILITATOR_ROOM_ID="!example:matrix.org"
CHAT_OFFLINE_MESSAGE="There is no-one currently available to chat."
```

## Local development
If you prefer to develop locally instead of on Glitch:

Clone the project
```
git clone https://github.com/nomadic-labs/ocrcc-bot.git
```

Install dependencies
```
cd ocrcc-bot
yarn
```

Copy the sample `.env` file and add in your own variables
```
cp .env.sample .env
```

Start the local server
```
yarn start
```

