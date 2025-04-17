// index.js - Main entry point for the NYRP Discord Staff Management Bot
const { Client, GatewayIntentBits, Partials, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// Import configuration and database
const config = require('./config');
const db = require('./database/dbHandler');

// Initialize Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

// Attach config to client for easy access
client.config = config;

// Initialize collections for commands and data
client.commands = new Collection();
client.cooldowns = new Collection();
client.activeInteractions = new Collection();
client.infractionReasons = new Map();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing required properties.`);
    }
}

// Load event handlers
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`Loaded event: ${event.name}`);
}

// Default event handlers

// Ready event - when bot successfully connects to Discord
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    try {
        // Connect to database
        await db.initializeDatabase();
        console.log('Database initialized successfully');
        
        // Set bot status
        client.user.setActivity('Staff Management', { type: 'WATCHING' });
        
        // Schedule tasks
        setupScheduledTasks();
        
        console.log('NYRP Staff Management Bot is now online!');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    
    if (!command) return;
    
    // Check cooldowns
    const { cooldowns } = client;
    
    if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
    }
    
    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const cooldownAmount = (command.cooldown || config.cooldowns[command.data.name] || 3) * 1000;
    
    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return interaction.reply({
                content: `Please wait ${timeLeft.toFixed(1)} more seconds before using the \`${command.data.name}\` command.`,
                ephemeral: true
            });
        }
    }
    
    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
    
    // Execute command
    try {
        // Log command usage
        const guildName = interaction.guild ? interaction.guild.name : 'DM';
        console.log(`[${new Date().toISOString()}] ${interaction.user.tag} in ${guildName} triggered /${interaction.commandName}`);
        
        // Add audit log entry
        await db.addAuditLog({
            actionType: 'COMMAND_USED',
            userId: interaction.user.id,
            details: {
                command: interaction.commandName,
                options: interaction.options._hoistedOptions.map(opt => ({
                    name: opt.name,
                    value: opt.value
                }))
            },
            timestamp: new Date().toISOString()
        });
        
        // Execute the command
        await command.execute(interaction, client);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        
        // Reply to user with error
        const errorMessage = {
            content: 'There was an error executing this command!',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Handle button, select menu, and other interaction components
client.on(Events.InteractionCreate, async interaction => {
    // Skip command interactions as they're handled above
    if (interaction.isChatInputCommand()) return;
    
    // Import handlers dynamically to keep main file clean
    if (interaction.isButton()) {
        require('./handlers/buttonHandler')(interaction, client);
    } else if (interaction.isStringSelectMenu()) {
        require('./handlers/selectMenuHandler')(interaction, client);
    } else if (interaction.isModalSubmit()) {
        require('./handlers/modalHandler')(interaction, client);
    }
});

// Set up scheduled tasks using node-cron
function setupScheduledTasks() {
    // Check for expired suspensions every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            const activeInfractions = await db.getActiveInfractions();
            const now = new Date();
            
            for (const infraction of activeInfractions) {
                // Skip non-suspension infractions
                if (!infraction.type.startsWith('suspension_')) continue;
                
                // Check if suspension has expired
                const expiryDate = new Date(infraction.expiry);
                if (expiryDate <= now) {
                    console.log(`Suspension ${infraction._id} has expired, restoring roles for user ${infraction.userId}`);
                    
                    // Get guild and member
                    const guild = client.guilds.cache.get(process.env.GUILD_ID);
                    if (!guild) continue;
                    
                    try {
                        const member = await guild.members.fetch(infraction.userId);
                        if (!member) continue;
                        
                        // Remove suspended role
                        if (member.roles.cache.has(config.staffRoles.suspended.id)) {
                            await member.roles.remove(config.staffRoles.suspended.id);
                        }
                        
                        // Restore previous roles
                        if (infraction.previousRoles && infraction.previousRoles.length > 0) {
                            for (const roleId of infraction.previousRoles) {
                                await member.roles.add(roleId);
                            }
                        }
                        
                        // Update infraction status
                        await db.updateInfractionStatus(infraction._id, 'completed', {
                            completedAt: now.toISOString(),
                            completedAutomatically: true
                        });
                        
                        // Log the restoration
                        const staffLogChannel = client.channels.cache.get(config.channels.staffLog);
                        if (staffLogChannel) {
                            await staffLogChannel.send({
                                embeds: [{
                                    title: 'Staff Action Log: Suspension Expired',
                                    color: 0xAAFFAA,
                                    description: `Suspension for <@${member.id}> has expired. Roles have been restored.`,
                                    timestamp: new Date()
                                }]
                            });
                        }
                        
                        // Try to notify the user
                        try {
                            await member.send({
                                embeds: [{
                                    title: 'Suspension Expired',
                                    color: 0xAAFFAA,
                                    description: 'Your suspension has expired and your roles have been restored.',
                                    timestamp: new Date()
                                }]
                            });
                        } catch (dmError) {
                            console.log(`Could not DM user ${member.id}: ${dmError.message}`);
                        }
                    } catch (memberError) {
                        console.error(`Error restoring roles for ${infraction.userId}:`, memberError);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking expired suspensions:', error);
        }
    });
    
    // Daily database backup at 3 AM
    cron.schedule('0 3 * * *', () => {
        console.log('Daily database backup triggered');
        // This would be implemented with actual backup logic
        // For MongoDB, you might use mongodump or another backup service
    });
}

// Handle process errors and graceful shutdown
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    try {
        await db.closeDatabase();
        client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
});

// Login to Discord
client.login(process.env.TOKEN);