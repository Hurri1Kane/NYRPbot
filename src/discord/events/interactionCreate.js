// src/discord/events/interactionCreate.js
const { Events, Collection } = require('discord.js');
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/errorHandler');
const checkPermissions = require('../utils/permissionManager');

// Track processed interactions to prevent duplicates
const processedInteractions = new Collection();
// Track deferral status of interactions
const deferredInteractions = new Collection();
// Track replied status of interactions
const repliedInteractions = new Collection();

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // Generate a unique identifier for this interaction
      const interactionKey = `${interaction.id}-${interaction.user.id}`;
      
      // Check if we've already processed this interaction
      if (processedInteractions.has(interactionKey)) {
        logger.debug(`Duplicate interaction detected and skipped: ${interactionKey}`);
        return;
      }
      
      // Mark this interaction as being processed
      processedInteractions.set(interactionKey, true);
      
      // Set cleanup timeout - remove from collections after 5 minutes
      setTimeout(() => {
        processedInteractions.delete(interactionKey);
        deferredInteractions.delete(interactionKey);
        repliedInteractions.delete(interactionKey);
      }, 300000); // 5 minutes
      
      // Log interaction for debugging
      logger.debug(`Processing interaction: ${interaction.id} (${interaction.type}) from ${interaction.user.tag}`);
      
      // Route the interaction based on its type
      if (interaction.isChatInputCommand()) {
        await handleChatCommand(interaction, interactionKey);
      } else if (interaction.isButton()) {
        await handleButton(interaction, interactionKey);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction, interactionKey);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction, interactionKey);
      } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
      }
    } catch (error) {
      // Generate error ID for tracking
      const errorId = ErrorHandler.handleInteractionError(
        error,
        interaction,
        'Top-level interaction handler'
      );
      
      // Try to send error message to user
      try {
        const errorMsg = `An unexpected error occurred (Error ID: ${errorId}). Support has been notified.`;
        
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: errorMsg, ephemeral: true });
        } else if (interaction.deferred) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await interaction.followUp({ content: errorMsg, ephemeral: true });
        }
      } catch (replyError) {
        // If that fails, just log it - we've already captured the original error
        logger.error(`Failed to send error message: ${replyError.message}`);
      }
    }
  }
};

/**
 * Handle slash commands
 */
async function handleChatCommand(interaction, interactionKey) {
  // Get the command from the client's command collection
  const command = interaction.client.commands.get(interaction.commandName);
  
  // If command doesn't exist, log warning and send error message
  if (!command) {
    logger.warn(`Command not found: ${interaction.commandName}`);
    await safeReply(interaction, { 
      content: 'This command is no longer available or has been disabled.',
      ephemeral: true
    }, interactionKey);
    return;
  }
  
  // Check for required subcommand
  if (command.subcommands && command.subcommands.length > 0 && interaction.options.getSubcommand(false) === null) {
    await safeReply(interaction, {
      content: 'This command requires a subcommand to be specified.',
      ephemeral: true
    }, interactionKey);
    return;
  }
  
  // Check user permissions
  let permissionsToCheck = command.permissions;
  
  // If it's a subcommand, check if it has specific permissions
  const subcommand = interaction.options.getSubcommand(false);
  if (subcommand && command.subcommandPermissions && command.subcommandPermissions[subcommand]) {
    permissionsToCheck = command.subcommandPermissions[subcommand];
  }
  
  const permissionResult = await checkPermissions(interaction, permissionsToCheck);
  
  if (!permissionResult.hasPermission) {
    await safeReply(interaction, {
      content: permissionResult.message || 'You do not have permission to use this command.',
      ephemeral: true
    }, interactionKey);
    return;
  }
  
  // Handle command cooldowns
  const { cooldowns } = interaction.client;
  if (!cooldowns.has(command.data.name)) {
    cooldowns.set(command.data.name, new Collection());
  }
  
  const now = Date.now();
  const timestamps = cooldowns.get(command.data.name);
  const cooldownAmount = (command.cooldown || 3) * 1000;
  
  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
    
    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      await safeReply(interaction, {
        content: `Please wait ${timeLeft.toFixed(1)} more second(s) before using \`/${command.data.name}\` again.`,
        ephemeral: true
      }, interactionKey);
      return;
    }
  }
  
  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
  
  // Execute the command
  try {
    logger.debug(`Executing command: ${interaction.commandName}${subcommand ? `/${subcommand}` : ''}`);
    await command.execute(interaction);
  } catch (error) {
    // Generate error ID for tracking
    const errorId = ErrorHandler.handleInteractionError(
      error,
      interaction,
      `Command execution: ${interaction.commandName}${subcommand ? `/${subcommand}` : ''}`
    );
    
    // Send error message
    await safeSendError(interaction, `An error occurred while executing this command (Error ID: ${errorId}).`, interactionKey);
  }
}

/**
 * Handle button interactions
 */
async function handleButton(interaction, interactionKey) {
  try {
    // Parse customId to determine which command handles this button
    const [commandName, action, ...args] = interaction.customId.split(':');
    
    // Get the command that handles this button
    const command = interaction.client.commands.get(commandName);
    
    if (!command || !command.buttons || !command.buttons[action]) {
      logger.warn(`No handler found for button ${interaction.customId}`);
      await safeReply(interaction, {
        content: 'This button is no longer supported.',
        ephemeral: true
      }, interactionKey);
      return;
    }
    
    // Execute the button handler
    await command.buttons[action](interaction, args);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(
      error,
      interaction,
      `Button handler: ${interaction.customId}`
    );
    
    await safeSendError(interaction, `An error occurred while processing this button (Error ID: ${errorId}).`, interactionKey);
  }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenu(interaction, interactionKey) {
  try {
    // Parse customId to determine which command handles this select menu
    const [commandName, menuName, ...args] = interaction.customId.split(':');
    
    // Get the command that handles this select menu
    const command = interaction.client.commands.get(commandName);
    
    if (!command || !command.selectMenus || !command.selectMenus[menuName]) {
      logger.warn(`No handler found for select menu ${interaction.customId}`);
      await safeReply(interaction, {
        content: 'This menu is no longer supported.',
        ephemeral: true
      }, interactionKey);
      return;
    }
    
    // Execute the select menu handler
    await command.selectMenus[menuName](interaction, args);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(
      error,
      interaction,
      `Select menu handler: ${interaction.customId}`
    );
    
    await safeSendError(interaction, `An error occurred while processing this menu (Error ID: ${errorId}).`, interactionKey);
  }
}

/**
 * Handle modal submissions
 */
async function handleModalSubmit(interaction, interactionKey) {
  try {
    // Parse customId to determine which command handles this modal
    const [commandName, modalName, ...args] = interaction.customId.split(':');
    
    // Get the command that handles this modal
    const command = interaction.client.commands.get(commandName);
    
    if (!command || !command.modals || !command.modals[modalName]) {
      logger.warn(`No handler found for modal ${interaction.customId}`);
      await safeReply(interaction, {
        content: 'This form is no longer supported.',
        ephemeral: true
      }, interactionKey);
      return;
    }
    
    // Execute the modal handler
    await command.modals[modalName](interaction, args);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(
      error,
      interaction,
      `Modal handler: ${interaction.customId}`
    );
    
    await safeSendError(interaction, `An error occurred while processing this form (Error ID: ${errorId}).`, interactionKey);
  }
}

/**
 * Handle autocomplete interactions
 */
async function handleAutocomplete(interaction) {
  try {
    const command = interaction.client.commands.get(interaction.commandName);
    
    if (!command || !command.autocomplete) {
      // Just return empty results since we can't notify the user of an error
      return await interaction.respond([]);
    }
    
    await command.autocomplete(interaction);
  } catch (error) {
    logger.error(`Error in autocomplete for ${interaction.commandName}: ${error.message}`);
    
    // Try to respond with empty results
    try {
      await interaction.respond([]);
    } catch (respondError) {
      // Nothing more we can do here
      logger.error(`Failed to send empty autocomplete response: ${respondError.message}`);
    }
  }
}

/**
 * Safely reply to an interaction, preventing interactionAlreadyReplied errors
 */
async function safeReply(interaction, replyOptions, interactionKey) {
  try {
    // Check if this interaction has already been replied to or deferred
    if (repliedInteractions.has(interactionKey)) {
      logger.debug(`Interaction ${interactionKey} already replied to, using followUp`);
      
      // If already replied, use followUp
      await interaction.followUp(replyOptions);
      return true;
    }
    
    if (deferredInteractions.has(interactionKey)) {
      logger.debug(`Interaction ${interactionKey} already deferred, using editReply`);
      
      // If already deferred, use editReply
      await interaction.editReply(replyOptions);
      
      // Mark as replied now
      repliedInteractions.set(interactionKey, true);
      return true;
    }
    
    // If we get here, the interaction hasn't been replied to or deferred yet
    logger.debug(`Interaction ${interactionKey} not yet replied to, using reply`);
    
    // Use try-catch because it still might fail if the interaction timed out
    await interaction.reply(replyOptions);
    
    // Mark as replied
    repliedInteractions.set(interactionKey, true);
    return true;
  } catch (error) {
    if (error.message.includes('already been acknowledged')) {
      logger.warn(`Interaction ${interactionKey} already acknowledged: ${error.message}`);
      
      // Try followUp as a last resort
      try {
        await interaction.followUp(replyOptions);
        return true;
      } catch (followUpError) {
        logger.error(`Failed to followUp on interaction ${interactionKey}: ${followUpError.message}`);
        return false;
      }
    }
    
    // If the error is about the interaction timing out
    if (error.message.includes('Unknown interaction') || error.message.includes('expired')) {
      logger.warn(`Interaction ${interactionKey} expired: ${error.message}`);
      return false;
    }
    
    // For any other error, rethrow it for the main error handler
    throw error;
  }
}

/**
 * Safely defer an interaction, preventing interactionAlreadyReplied errors
 */
async function safeDefer(interaction, options = { ephemeral: false }, interactionKey) {
  try {
    // Check if this interaction has already been replied to or deferred
    if (repliedInteractions.has(interactionKey) || deferredInteractions.has(interactionKey)) {
      logger.debug(`Interaction ${interactionKey} already handled, not deferring`);
      return false;
    }
    
    // Defer the interaction
    logger.debug(`Deferring interaction ${interactionKey}`);
    await interaction.deferReply(options);
    
    // Mark as deferred
    deferredInteractions.set(interactionKey, true);
    return true;
  } catch (error) {
    // If already acknowledged or expired, just log and return
    if (error.message.includes('already been acknowledged') || 
        error.message.includes('Unknown interaction') || 
        error.message.includes('expired')) {
      logger.warn(`Could not defer interaction ${interactionKey}: ${error.message}`);
      return false;
    }
    
    // For any other error, rethrow
    throw error;
  }
}

/**
 * Safely send an error message for a failed interaction
 */
async function safeSendError(interaction, errorMessage, interactionKey) {
  try {
    // Try to send the error using the appropriate method
    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, { 
        content: errorMessage, 
        ephemeral: true 
      }, interactionKey);
    } else if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage });
    } else {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    }
  } catch (error) {
    // If all else fails, just log it
    logger.error(`Failed to send error message: ${error.message}`);
  }
}

// Export helper functions for use in other files
module.exports.safeReply = safeReply;
module.exports.safeDefer = safeDefer;
module.exports.safeSendError = safeSendError;