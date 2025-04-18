// index.js - Main entry point for the NYRP Discord Staff Management Bot
const { Client, GatewayIntentBits, Partials, Collection, Events, EmbedBuilder } = require('discord.js');
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
client.infractionEvidence = new Map();
client.infractionData = new Map(); // Add this line to initialize the infractionData Map


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
    
    // Get the configured cooldown from command or config, defaulting to 3 seconds
    // Also add a safety maximum of 5 minutes (300 seconds)
    const configuredCooldown = command.cooldown || 
                              (config.cooldowns[command.data.name] || 3);
    const maxCooldown = 300; // 5 minutes in seconds
    const cooldownAmount = Math.min(configuredCooldown, maxCooldown) * 1000;
    
    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
        // Add a sanity check to ensure the cooldown doesn't exceed our maximum
        const maximumExpirationTime = now + (maxCooldown * 1000);
        const effectiveExpirationTime = Math.min(expirationTime, maximumExpirationTime);
        
        if (now < effectiveExpirationTime) {
            const timeLeft = Math.max(1, (effectiveExpirationTime - now) / 1000);
            
            // Log excessive cooldowns for debugging
            if ((expirationTime - now) / 1000 > maxCooldown) {
                console.warn(`Excessive cooldown detected for ${interaction.user.tag} (${interaction.user.id}) on command ${command.data.name}. Original: ${((expirationTime - now) / 1000).toFixed(1)}s, Capped to: ${timeLeft.toFixed(1)}s`);
            }
            
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

    // Check for inactive tickets every 6 hours
    cron.schedule('0 */6 * * *', async () => {
        try {
            console.log('Running ticket inactivity check...');
            
            // Get tickets that have been inactive for 24 hours
            const inactiveTickets = await db.getInactiveTickets(24);
            console.log(`Found ${inactiveTickets.length} inactive tickets`);
            
            for (const ticket of inactiveTickets) {
                // Get the channel
                const guild = client.guilds.cache.get(process.env.GUILD_ID);
                if (!guild) continue;
                
                const channel = guild.channels.cache.get(ticket.channelId);
                if (!channel) continue;
                
                // Check if we've already sent a reminder (don't spam reminders)
                if (ticket.reminderSent) continue;
                
                // Send reminder message
                const reminderEmbed = new EmbedBuilder()
                    .setTitle('Ticket Reminder')
                    .setDescription('This ticket has been inactive for 24 hours. If you need further assistance, please respond. Otherwise, you can close this ticket by clicking the Close Ticket button.')
                    .setColor('#FFA500') // Orange
                    .setTimestamp();
                    
                await channel.send({
                    content: `<@${ticket.creatorId}> <@${ticket.claimedBy || '&' + config.staffRoles.staffTeam.id}>`,
                    embeds: [reminderEmbed]
                });
                
                // Mark reminder as sent
                await db.updateTicket(ticket._id, {
                    reminderSent: true
                });
                
                console.log(`Sent reminder for ticket ${ticket._id}`);
            }
            
            // Get tickets inactive for 72 hours (3 days) and auto-close them
            const veryInactiveTickets = await db.getInactiveTickets(72);
            console.log(`Found ${veryInactiveTickets.length} very inactive tickets to auto-close`);
            
            for (const ticket of veryInactiveTickets) {
                // Get the channel
                const guild = client.guilds.cache.get(process.env.GUILD_ID);
                if (!guild) continue;
                
                const channel = guild.channels.cache.get(ticket.channelId);
                if (!channel) continue;
                
                // Auto-close the ticket
                const closingEmbed = new EmbedBuilder()
                    .setTitle('Ticket Auto-Closed')
                    .setDescription('This ticket has been automatically closed due to 3 days of inactivity. If you still need assistance, please open a new ticket.')
                    .setColor('#E74C3C') // Red
                    .setTimestamp();
                    
                await channel.send({
                    content: `<@${ticket.creatorId}>`,
                    embeds: [closingEmbed]
                });
                
                // Update ticket in database
                await db.updateTicket(ticket._id, {
                    status: 'closed',
                    closedBy: client.user.id,
                    closedAt: new Date().toISOString(),
                    closedReason: 'Auto-closed due to inactivity'
                });
                
                // Add audit log
                await db.addAuditLog({
                    actionType: 'TICKET_AUTO_CLOSED',
                    userId: client.user.id,
                    targetId: ticket.creatorId,
                    details: {
                        ticketId: ticket._id,
                        channelId: ticket.channelId,
                        reason: 'Inactivity (72 hours)'
                    }
                });
                
                // Create transcript and delete after a delay
                try {
                    const discordTranscripts = require('discord-html-transcripts');
                    const transcript = await discordTranscripts.createTranscript(channel, {
                        limit: -1,
                        fileName: `transcript-${ticket._id}.html`,
                        saveImages: true,
                        footerText: `Transcript of auto-closed ticket ${ticket._id}`,
                        poweredBy: false
                    });
                    
                    // Send transcript to staff log
                    const staffLogChannel = client.channels.cache.get(config.channels.staffLog);
                    if (staffLogChannel) {
                        await staffLogChannel.send({
                            content: `Transcript for auto-closed ticket ${ticket._id}:`,
                            files: [transcript]
                        });
                    }
                    
                    // Schedule channel deletion after 24 hours
                    setTimeout(async () => {
                        try {
                            if (channel.deletable) {
                                await channel.delete();
                                console.log(`Deleted channel for auto-closed ticket ${ticket._id}`);
                            }
                        } catch (deleteError) {
                            console.error(`Error deleting channel for ticket ${ticket._id}:`, deleteError);
                        }
                    }, 24 * 60 * 60 * 1000); // 24 hours
                    
                } catch (transcriptError) {
                    console.error(`Error creating transcript for ticket ${ticket._id}:`, transcriptError);
                }
                
                console.log(`Auto-closed ticket ${ticket._id}`);
            }
        } catch (error) {
            console.error('Error in ticket inactivity check:', error);
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