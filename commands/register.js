// commands/register.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Registers all slash commands with Discord
 * @returns {Promise<void>}
 */
async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands.');
        
        // Get all command files
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath)
            .filter(file => file.endsWith('.js') && file !== 'register.js');
        
        // Load commands
        const commands = [];
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command) {
                commands.push(command.data.toJSON());
                console.log(`Loaded command for registration: ${command.data.name}`);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a data property.`);
            }
        }
        
        // Initialize REST API client
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        // Register commands - Check if GUILD_ID exists for guild commands or global commands
        if (process.env.GUILD_ID) {
            // Guild commands - update instantly, only work in specified guild
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log(`Successfully registered ${commands.length} guild commands for guild ${process.env.GUILD_ID}.`);
        } else {
            // Global commands - can take up to an hour to update, work in all guilds
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log(`Successfully registered ${commands.length} global commands.`);
        }
    } catch (error) {
        console.error('Error registering commands:', error);
        throw error;
    }
}

/**
 * Updates a single command or adds it if it doesn't exist
 * @param {string} commandName - The name of the command to update
 * @returns {Promise<void>}
 */
async function updateCommand(commandName) {
    try {
        console.log(`Started updating command: ${commandName}`);
        
        // Path to the command file
        const commandPath = path.join(__dirname, '../commands', `${commandName}.js`);
        
        // Check if the command file exists
        if (!fs.existsSync(commandPath)) {
            console.error(`Command file not found: ${commandPath}`);
            return;
        }
        
        // Load the command
        const command = require(commandPath);
        
        if (!('data' in command)) {
            console.error(`The command ${commandName} is missing a data property.`);
            return;
        }
        
        // Initialize REST API client
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        // Update the command
        if (process.env.GUILD_ID) {
            // Guild command
            await rest.post(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: command.data.toJSON() }
            );
            console.log(`Successfully updated guild command: ${commandName}`);
        } else {
            // Global command
            await rest.post(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: command.data.toJSON() }
            );
            console.log(`Successfully updated global command: ${commandName}`);
        }
    } catch (error) {
        console.error(`Error updating command ${commandName}:`, error);
        throw error;
    }
}

/**
 * Deletes a command
 * @param {string} commandName - The name of the command to delete
 * @returns {Promise<void>}
 */
async function deleteCommand(commandName) {
    try {
        console.log(`Started deleting command: ${commandName}`);
        
        // Initialize REST API client
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        // Get existing commands
        let commands;
        
        if (process.env.GUILD_ID) {
            // Guild commands
            commands = await rest.get(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            );
        } else {
            // Global commands
            commands = await rest.get(
                Routes.applicationCommands(process.env.CLIENT_ID)
            );
        }
        
        // Find the command ID
        const commandToDelete = commands.find(cmd => cmd.name === commandName);
        
        if (!commandToDelete) {
            console.error(`Command not found: ${commandName}`);
            return;
        }
        
        // Delete the command
        if (process.env.GUILD_ID) {
            // Guild command
            await rest.delete(
                Routes.applicationGuildCommand(
                    process.env.CLIENT_ID,
                    process.env.GUILD_ID,
                    commandToDelete.id
                )
            );
            console.log(`Successfully deleted guild command: ${commandName}`);
        } else {
            // Global command
            await rest.delete(
                Routes.applicationCommand(
                    process.env.CLIENT_ID,
                    commandToDelete.id
                )
            );
            console.log(`Successfully deleted global command: ${commandName}`);
        }
    } catch (error) {
        console.error(`Error deleting command ${commandName}:`, error);
        throw error;
    }
}

// For direct execution of this script
if (require.main === module) {
    registerCommands().catch(console.error);
}

module.exports = {
    registerCommands,
    updateCommand,
    deleteCommand
};