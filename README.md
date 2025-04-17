# NYRP Discord Staff Management Bot

A comprehensive Discord bot designed specifically for managing staff operations in the New York Roleplay (NYRP) Discord servers.

## Features

### Staff Role Hierarchy Management
- Complete staff hierarchy with 22 ranks from Trial Moderator to Director
- Special status roles (Under Investigation, Blacklisted, Suspended)
- Category roles that group ranks into functional teams

### Infraction System
- Multiple infraction types: Warning, Suspension, Demotion, Blacklist, Under Investigation
- Director approval workflow for all infractions
- Automatic role management for suspensions and other penalties
- Suspension expiry automation with role restoration

### Promotion System
- Streamlined promotions with appropriate rank suggestions
- Automatic role updates including category roles
- Promotion announcements with customizable reasons

### Ticket System
- Support for different ticket categories: General Support, In-Game Reports, Staff Reports
- Claim system for staff accountability
- Priority setting and ticket management tools
- Transcript generation for record-keeping

### Internal Affairs Office System
- Private channels for disciplinary discussions
- Role-based access control for sensitive conversations
- Office management and tracking capabilities

### Utility Commands
- Role verification and debugging
- System status and health monitoring
- Administrative tools for server management

## Technical Implementation

### Database
- MongoDB for data persistence
- Collections for infractions, tickets, offices, promotions, and audit logs
- Indexes for optimized query performance

### Framework
- Discord.js v14 for Discord API interaction
- Node.js runtime environment
- Slash command support for modern Discord interaction

### Security Features
- Role-based permission system
- Audit logging for all administrative actions
- Verification systems to prevent accidental role changes

## Installation

1. Clone the repository:
```
git clone https://github.com/your-username/nyrp-discord-bot.git
cd nyrp-discord-bot
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file with the following variables:
```
TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_discord_server_id
MONGODB_URI=your_mongodb_connection_string
DB_NAME=nyrp_staff_bot
```

4. Register slash commands:
```
npm run register
```

5. Start the bot:
```
npm start
```

## Command Overview

### Staff Management
- `/infract @user reason` - Create an infraction for a staff member
- `/promote @user reason` - Promote a staff member
- `/restore @user` - Manually restore roles after a suspension

### Ticket System
- `/ticket create reason` - Create a new support ticket
- `/ticket add @user reason` - Add a user to a ticket
- `/ticket remove @user reason` - Remove a user from a ticket
- `/elevatereport @reported_user reason` - Elevate a staff report based on rank
- `/restorereport` - Restore normal permissions for a report

### Internal Affairs
- `/officecreate @user reason evidence` - Create a private office channel
- `/officeinfo list` - List all active offices
- `/officeinfo stats` - Show office statistics

### Utility Commands
- `/infractions` - View all infractions
- `/infractions @user` - View a specific user's infractions
- `/checkroles` - Verify all configured roles exist
- `/debug roles` - Show your roles vs. bot configuration
- `/debug serverroles` - List all server roles with IDs
- `/getallids` - Get all role and channel IDs
- `/reload` - Reload all commands without restarting

## Project Structure

```
nyrp-discord-bot/
├── commands/           # Slash command implementations
├── database/           # Database interaction
├── events/             # Discord.js event handlers
├── utils/              # Utility functions
├── handlers/           # Business logic handlers
├── data/               # Data cache and configuration
├── scripts/            # Utility scripts
├── config.js           # Configuration
├── index.js            # Main entry point
└── package.json        # Dependencies
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request
