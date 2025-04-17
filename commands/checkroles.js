// commands/checkroles.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkroles')
        .setDescription('Verify if all configured roles exist in the server'),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Internal Affairs or higher rank
        const hasPermission = interaction.member.roles.cache.some(role => 
            [staffRoles.trialInternalAffairs.id, staffRoles.internalAffairs.id, 
             staffRoles.internalAffairsDirector.id, staffRoles.highRank.id,
             staffRoles.seniorHighRank.id].includes(role.id)
        );
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be Trial Internal Affairs or higher to use this command.',
                ephemeral: true
            });
        }
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const guild = interaction.guild;
            const missingRoles = [];
            const foundRoles = [];
            
            // Check if all configured roles exist in the server
            for (const [key, roleData] of Object.entries(staffRoles)) {
                const role = guild.roles.cache.get(roleData.id);
                if (!role) {
                    missingRoles.push({
                        name: roleData.name,
                        id: roleData.id,
                        key: key
                    });
                } else {
                    foundRoles.push({
                        name: role.name,
                        id: role.id,
                        key: key,
                        actualName: roleData.name
                    });
                }
            }
            
            // Create an embed with the results
            const embed = new EmbedBuilder()
                .setTitle('Role Configuration Check')
                .setColor(missingRoles.length > 0 ? '#FF5555' : '#55FF55')
                .setDescription(missingRoles.length > 0 ? 
                    `Found ${foundRoles.length} roles, ${missingRoles.length} are missing.` : 
                    `All ${foundRoles.length} configured roles exist in the server.`)
                .setTimestamp();
            
            // Add fields for missing roles
            if (missingRoles.length > 0) {
                let missingRolesContent = '';
                
                for (const role of missingRoles) {
                    missingRolesContent += `- ${role.name} (${role.key}): ${role.id}\n`;
                }
                
                embed.addFields({
                    name: 'Missing Roles',
                    value: missingRolesContent
                });
            }
            
            // Check for name mismatches
            const nameMismatches = foundRoles.filter(role => role.name !== role.actualName);
            
            if (nameMismatches.length > 0) {
                let mismatchContent = '';
                
                for (const role of nameMismatches) {
                    mismatchContent += `- ${role.key}: Expected "${role.actualName}" but found "${role.name}"\n`;
                }
                
                embed.addFields({
                    name: 'Name Mismatches',
                    value: mismatchContent
                });
                
                // Add a warning color if there are mismatches
                if (missingRoles.length === 0) {
                    embed.setColor('#FFAA00');
                }
            }
            
            await interaction.editReply({
                embeds: [embed],
                ephemeral: true
            });
            
            // Log to staff log channel if there are issues
            if (missingRoles.length > 0 || nameMismatches.length > 0) {
                const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
                if (staffLogChannel) {
                    await staffLogChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Role Configuration Issues Detected')
                                .setColor('#FF5555')
                                .setDescription(`${interaction.user.tag} ran a role check and found issues.`)
                                .addFields(
                                    { name: 'Missing Roles', value: missingRoles.length.toString(), inline: true },
                                    { name: 'Name Mismatches', value: nameMismatches.length.toString(), inline: true }
                                )
                                .setTimestamp()
                        ]
                    });
                }
            }
            
        } catch (error) {
            console.error('Error checking roles:', error);
            await interaction.editReply({
                content: 'There was an error checking roles. Please try again later.',
                ephemeral: true
            });
        }
    }
};