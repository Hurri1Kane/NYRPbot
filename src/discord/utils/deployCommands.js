// src/discord/utils/deployCommands.js
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/errorHandler');

/**
 * Deploy slash commands to Discord
 * @param {boolean} global - Whether to deploy commands globally or to a specific guild
 */
async function deployCommands(global = false) {
  try {
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');
    const commandFolders = fs.readdirSync(commandsPath);
    
    logger.info('Loading commands for deployment...');
    
    // Load all command data
    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);
      const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
      
      for (const file of commandFiles) {
        try {
          const filePath = path.join(folderPath, file);
          const command = require(filePath);
          
          if ('data' in command && typeof command.data.toJSON === 'function') {
            commands.push(command.data.toJSON());
            logger.debug(`Loaded command ${command.data.name} for deployment`);
          } else {
            logger.warn(`The command at ${filePath} is missing a required "data" property or toJSON method.`);
          }
        } catch (error) {
          logger.error(`Error loading command file ${file}: ${error.message}`);
        }
      }
    }
    
    logger.info(`Loaded ${commands.length} commands for deployment.`);
    
    // Initialize REST API client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    if (global) {
      // Global command deployment
      logger.info('Deploying commands globally...');
      
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      
      logger.info(`Successfully deployed ${commands.length} global commands.`);
    } else {
      // Guild-specific command deployment
      const guildId = process.env.DEV_GUILD_ID;
      
      if (!guildId) {
        throw new Error('DEV_GUILD_ID is required for guild command deployment');
      }
      
      logger.info(`Deploying commands to guild ${guildId}...`);
      
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands }
      );
      
      logger.info(`Successfully deployed ${commands.length} commands to guild ${guildId}.`);
    }
    
    return commands.length;
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(error, 'Command Deployment');
    logger.error(`Failed to deploy commands: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
}

/**
 * Clear all commands from Discord
 * @param {boolean} global - Whether to clear global commands or guild commands
 */
async function clearCommands(global = false) {
  try {
    // Initialize REST API client
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    if (global) {
      // Clear global commands
      logger.info('Clearing all global commands...');
      
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] }
      );
      
      logger.info('Successfully cleared all global commands.');
    } else {
      // Clear guild commands
      const guildId = process.env.DEV_GUILD_ID;
      
      if (!guildId) {
        throw new Error('DEV_GUILD_ID is required for guild command clearing');
      }
      
      logger.info(`Clearing all commands from guild ${guildId}...`);
      
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: [] }
      );
      
      logger.info(`Successfully cleared all commands from guild ${guildId}.`);
    }
    
    return true;
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(error, 'Command Clearing');
    logger.error(`Failed to clear commands: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
}

module.exports = {
  deployCommands,
  clearCommands
};