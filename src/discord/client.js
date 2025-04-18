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

// src/discord/events/interactionCreate.js
const { Events } = require('discord.js');
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/errorHandler');
const { isInteractionProcessed, markInteractionProcessed } = require('../client');
const checkPermissions = require('../utils/permissionManager');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // Check if this interaction is already being processed (prevents duplicates)
      if (isInteractionProcessed(interaction.id)) {
        logger.debug(`Duplicate interaction detected. ID: ${interaction.id}`);
        return;
      }
      
      // Mark this interaction as being processed
      markInteractionProcessed(interaction.id);
      
      // Handle different interaction types
      if (interaction.isChatInputCommand()) {
        await handleChatInputCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmitInteraction(interaction);
      } else if (interaction.isAutocomplete()) {
        await handleAutocompleteInteraction(interaction);
      }
    } catch (error) {
      // Handle any unhandled errors from the interaction processing
      await ErrorHandler.handleInteractionError(error, interaction, 'Top-level interaction handler');
    }
  },
};

// Handler for chat input (slash) commands
async function handleChatInputCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  
  if (!command) {
    logger.warn(`Command ${interaction.commandName} not found.`);
    return await interaction.reply({
      content: 'This command is unavailable or has been disabled.',
      ephemeral: true
    });
  }
  
  // Check cooldowns
  const { cooldowns } = interaction.client;
  if (!cooldowns.has(command.data.name)) {
    cooldowns.set(command.data.name, new Collection());
  }
  
  const now = Date.now();
  const timestamps = cooldowns.get(command.data.name);
  const cooldownAmount = (command.cooldown || 3) * 1000;
  
  // Apply cooldown if user has used this command recently
  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
    
    if (now < expirationTime) {
      const expiredTimestamp = Math.round(expirationTime / 1000);
      return await interaction.reply({
        content: `Please wait <t:${expiredTimestamp}:R> before using the \`${command.data.name}\` command again.`,
        ephemeral: true
      });
    }
  }
  
  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
  
  try {
    // Check permissions before executing command
    const permissionResult = await checkPermissions(interaction, command.permissions);
    
    if (!permissionResult.hasPermission) {
      return await interaction.reply({
        content: permissionResult.message || 'You do not have permission to use this command.',
        ephemeral: true
      });
    }
    
    // Execute the command
    await command.execute(interaction);
  } catch (error) {
    await ErrorHandler.handleInteractionError(error, interaction, `Command: ${interaction.commandName}`);
  }
}

// Handler for button interactions
async function handleButtonInteraction(interaction) {
  // Extract the command name and action from custom ID (format: commandName:action:extraData)
  const [commandName, action, ...extraData] = interaction.customId.split(':');
  
  const command = interaction.client.commands.get(commandName);
  
  if (!command || !command.buttons || !command.buttons[action]) {
    logger.warn(`Button handler for ${interaction.customId} not found.`);
    return await interaction.reply({
      content: 'This button is no longer supported or has been disabled.',
      ephemeral: true
    });
  }
  
  try {
    // Check permissions if specified for this button
    const buttonPermissions = command.buttonPermissions?.[action];
    if (buttonPermissions) {
      const permissionResult = await checkPermissions(interaction, buttonPermissions);
      
      if (!permissionResult.hasPermission) {
        return await interaction.reply({
          content: permissionResult.message || 'You do not have permission to use this button.',
          ephemeral: true
        });
      }
    }
    
    // Execute the button handler
    await command.buttons[action](interaction, extraData);
  } catch (error) {
    await ErrorHandler.handleInteractionError(error, interaction, `Button: ${interaction.customId}`);
  }
}

// Handler for select menu interactions
async function handleSelectMenuInteraction(interaction) {
  // Extract the command name and action from custom ID (format: commandName:selectMenu:extraData)
  const [commandName, menuName, ...extraData] = interaction.customId.split(':');
  
  const command = interaction.client.commands.get(commandName);
  
  if (!command || !command.selectMenus || !command.selectMenus[menuName]) {
    logger.warn(`Select menu handler for ${interaction.customId} not found.`);
    return await interaction.reply({
      content: 'This menu is no longer supported or has been disabled.',
      ephemeral: true
    });
  }
  
  try {
    // Check permissions if specified for this select menu
    const menuPermissions = command.selectMenuPermissions?.[menuName];
    if (menuPermissions) {
      const permissionResult = await checkPermissions(interaction, menuPermissions);
      
      if (!permissionResult.hasPermission) {
        return await interaction.reply({
          content: permissionResult.message || 'You do not have permission to use this menu.',
          ephemeral: true
        });
      }
    }
    
    // Execute the select menu handler
    await command.selectMenus[menuName](interaction, extraData);
  } catch (error) {
    await ErrorHandler.handleInteractionError(error, interaction, `Select Menu: ${interaction.customId}`);
  }
}

// Handler for modal submit interactions
async function handleModalSubmitInteraction(interaction) {
  // Extract the command name and action from custom ID (format: commandName:modal:extraData)
  const [commandName, modalName, ...extraData] = interaction.customId.split(':');
  
  const command = interaction.client.commands.get(commandName);
  
  if (!command || !command.modals || !command.modals[modalName]) {
    logger.warn(`Modal handler for ${interaction.customId} not found.`);
    return await interaction.reply({
      content: 'This form is no longer supported or has been disabled.',
      ephemeral: true
    });
  }
  
  try {
    // Check permissions if specified for this modal
    const modalPermissions = command.modalPermissions?.[modalName];
    if (modalPermissions) {
      const permissionResult = await checkPermissions(interaction, modalPermissions);
      
      if (!permissionResult.hasPermission) {
        return await interaction.reply({
          content: permissionResult.message || 'You do not have permission to submit this form.',
          ephemeral: true
        });
      }
    }
    
    // Execute the modal handler
    await command.modals[modalName](interaction, extraData);
  } catch (error) {
    await ErrorHandler.handleInteractionError(error, interaction, `Modal: ${interaction.customId}`);
  }
}

// Handler for autocomplete interactions
async function handleAutocompleteInteraction(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  
  if (!command || !command.autocomplete) {
    logger.warn(`Autocomplete handler for ${interaction.commandName} not found.`);
    return;
  }
  
  try {
    await command.autocomplete(interaction);
  } catch (error) {
    // For autocomplete, we just log the error since we can't reply to the interaction
    logger.error(`Error in autocomplete for ${interaction.commandName}: ${error.message}`);
  }
}