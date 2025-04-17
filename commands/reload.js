// commands/reload.js
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { registerCommands } = require('./register');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reload all commands without restarting the bot (for Directive Team and Developers only)'),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Directive Team role or is a Developer
        const isDirective = interaction.member.roles.cache.has(staffRoles.directiveTeam.id);
        const isDeveloper = interaction.member.id === process.env.DEVELOPER_ID; // Optional: Set a developer ID in .env
        
        if (!isDirective && !isDeveloper) {
            return interaction.reply({
                content: 'You must be a member of the Directive Team or a Bot Developer to use this command.',
                ephemeral: true
            });
        }
        
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Clear the commands collection
            client.commands.clear();
            
            // Path to commands directory
            const commandsPath = path.join(__dirname, '../commands');
            
            // Get all command files
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'register.js');
            
            // Delete require cache for commands
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                delete require.cache[require.resolve(filePath)];
            }
            
            // Re-load command files
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    const command = require(filePath);
                    
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        console.log(`Reloaded command: ${command.data.name}`);
                    } else {
                        console.log(`[WARNING] The command at ${filePath} is missing required properties.`);
                    }
                } catch (error) {
                    console.error(`Error loading command ${file}:`, error);
                }
            }
            
            // Re-register slash commands with Discord API
            await registerCommands();
            
            await interaction.editReply({
                content: `Successfully reloaded ${client.commands.size} commands.`,
                ephemeral: true
            });
            
            // Log the action
            const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
            if (staffLogChannel) {
                await staffLogChannel.send({
                    content: `🔄 ${interaction.user.tag} reloaded all bot commands.`
                });
            }
            
        } catch (error) {
            console.error('Error reloading commands:', error);
            
            // If we've already deferred, edit the reply
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'There was an error reloading commands. Check console for details.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error reloading commands. Check console for details.',
                    ephemeral: true
                });
            }
        }
    }
};