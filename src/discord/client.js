// src/discord/client.js
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction
  ]
});

// Collections to store commands and cooldowns
client.commands = new Collection();
client.cooldowns = new Collection();
client.pendingInteractions = new Collection();

// Function to load commands
async function loadCommands() {
  try {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(commandsPath);
    
    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);
      const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
      
      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        
        // Set command in collection if it has valid data and execute method
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          logger.info(`Loaded command: ${command.data.name}`);
        } else {
          logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      }
    }
    
    logger.info(`Successfully loaded ${client.commands.size} commands.`);
    return client.commands.size;
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(error, 'Command Loading');
    logger.error(`Failed to load commands: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
}

// Function to register event handlers
async function registerEvents() {
  try {
    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    let loadedEvents = 0;
    
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      
      loadedEvents++;
      logger.info(`Registered event: ${event.name}`);
    }
    
    logger.info(`Successfully registered ${loadedEvents} events.`);
    return loadedEvents;
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(error, 'Event Registration');
    logger.error(`Failed to register events: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
}

// Function to check if interaction has been processed
function isInteractionProcessed(interactionId) {
  return client.pendingInteractions.has(interactionId);
}

// Function to mark interaction as processed
function markInteractionProcessed(interactionId) {
  client.pendingInteractions.set(interactionId, true);
  
  // Set a timeout to remove the interaction from the collection after 5 minutes
  setTimeout(() => {
    client.pendingInteractions.delete(interactionId);
  }, 300000); // 5 minutes
}

module.exports = {
  client,
  loadCommands,
  registerEvents,
  isInteractionProcessed,
  markInteractionProcessed
};

