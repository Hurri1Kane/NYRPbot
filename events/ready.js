// events/ready.js
const { Events } = require('discord.js');
const { registerCommands } = require('../commands/register');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        
        // Register slash commands on startup
        try {
            await registerCommands();
        } catch (error) {
            console.error('Error registering commands:', error);
        }
        
        // Set activity status
        client.user.setActivity('Staff Management', { type: 'WATCHING' });
        
        // Check for role configuration
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            const staffRoles = client.config.staffRoles;
            const missingRoles = [];
            
            // Check if all configured roles exist in the server
            for (const [key, roleData] of Object.entries(staffRoles)) {
                const role = guild.roles.cache.get(roleData.id);
                if (!role) {
                    missingRoles.push(`${roleData.name} (${roleData.id})`);
                }
            }
            
            if (missingRoles.length > 0) {
                console.warn(`[WARNING] The following configured roles are missing from the server:`);
                missingRoles.forEach(role => console.warn(`- ${role}`));
                
                // Log to staff log channel if available
                const staffLogChannel = guild.channels.cache.get(client.config.channels.staffLog);
                if (staffLogChannel) {
                    staffLogChannel.send({
                        embeds: [{
                            title: 'Bot Configuration Warning',
                            description: 'The following configured roles are missing from the server:',
                            fields: [{ name: 'Missing Roles', value: missingRoles.join('\n') }],
                            color: 0xFFAA00,
                            timestamp: new Date()
                        }]
                    }).catch(console.error);
                }
            } else {
                console.log('All configured roles exist in the server.');
            }
        }
    }
};