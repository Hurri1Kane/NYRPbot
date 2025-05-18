# NYRP Bot

Discord Staff Management Bot for NYRP (New York Roleplay) servers.

## Features

- Staff activity tracking
- Staff management dashboard
- Server settings configuration
- Activity reports and statistics

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/nyrp-bot.git
cd nyrp-bot
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file based on the `env.example` template:
```
cp env.example .env
```

4. Edit the `.env` file with your Discord application credentials and MongoDB URI.

5. Start the bot:
```
npm start
```

## Web Dashboard

The NYRP Bot comes with a web dashboard for easy management of your Discord servers and staff.

### Setting up the Dashboard

1. Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Set up OAuth2 with the following redirect URL:
   - `http://localhost:3000/auth/discord/callback` (for local development)
   - `https://your-domain.com/auth/discord/callback` (for production)
3. Enable the "identify" and "guilds" scopes in your OAuth2 settings
4. Update your `.env` file with the Discord application credentials
5. Start the web dashboard:
```
npm run web
```

### Dashboard Features

- Server management
- Staff activity tracking
- Bot configuration
- User settings

## License

This project is licensed under the MIT License - see the LICENSE file for details.
