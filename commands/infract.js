// commands/infract.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeReply } = require('../utils/interactionHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infract')
        .setDescription('Create an infraction for a staff member')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The staff member to infract')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for the infraction')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('evidence')
                .setDescription('Evidence for the infraction (optional)')
                .setRequired(false)),
    async execute(interaction, client) {
        try {
            // Get staff roles configuration
            const staffRoles = client.config.staffRoles;
            
            // Check if user has Internal Affairs or higher rank
            const hasPermission = interaction.member.roles.cache.some(role => 
                [staffRoles.trialInternalAffairs.id, staffRoles.internalAffairs.id, 
                 staffRoles.internalAffairsDirector.id, staffRoles.highRank.id,
                 staffRoles.seniorHighRank.id, staffRoles.assistantDirector.id, 
                 staffRoles.leadAssistantDirector.id, staffRoles.viceDeputyDirector.id, 
                 staffRoles.deputyDirector.id, staffRoles.director.id].includes(role.id)
            );
            
            if (!hasPermission) {
                return safeReply(interaction, {
                    content: 'You must be Trial Internal Affairs or higher to use this command.',
                    ephemeral: true
                });
            }
            
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const evidence = interaction.options.getString('evidence') || 'No evidence provided';
            
            // Get the target member
            const guild = interaction.guild;
            let targetMember;
            
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                return safeReply(interaction, {
                    content: 'The target user is not in the server.',
                    ephemeral: true
                });
            }
            
            // Check if target has staff team role
            const isStaff = targetMember.roles.cache.has(staffRoles.staffTeam.id);
            
            if (!isStaff) {
                return safeReply(interaction, {
                    content: 'The target user is not a staff member.',
                    ephemeral: true
                });
            }
            
            // Initialize Maps if they don't exist
            client.infractionData = client.infractionData || new Map();
            client.infractionReasons = client.infractionReasons || new Map();
            client.infractionEvidence = client.infractionEvidence || new Map();
            
            // Store data in both places for backward compatibility
            client.infractionReasons.set(targetUser.id, reason);
            client.infractionEvidence.set(targetUser.id, evidence);
            
            // Store all data in one place
            client.infractionData.set(targetUser.id, {
                reason: reason,
                evidence: evidence !== 'No evidence provided' ? [evidence] : [],
                appealable: null  // This will be set later in the process
            });
            
            // Create appealable buttons
            const appealableRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`appealable:${targetUser.id}:true`)
                        .setLabel('Appealable')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`appealable:${targetUser.id}:false`)
                        .setLabel('Not Appealable')
                        .setStyle(ButtonStyle.Danger)
                );
            
            // Create a preview embed for the infraction
            const previewEmbed = new EmbedBuilder()
                .setTitle('Create Staff Infraction')
                .setColor('#FF5555')
                .setDescription(`You are creating an infraction for ${targetUser.tag}`)
                .addFields(
                    { name: 'Target', value: targetUser.tag, inline: true },
                    { name: 'Current Rank', value: getCurrentRank(targetMember, staffRoles), inline: true },
                    { name: 'Reason', value: reason },
                    { name: 'Evidence', value: evidence }
                )
                .setFooter({ text: 'First select if this infraction is appealable' });
            
            return safeReply(interaction, {
                embeds: [previewEmbed],
                components: [appealableRow],
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error in infract command:', error);
            
            return safeReply(interaction, {
                content: 'There was an error while creating the infraction. Please try again.',
                ephemeral: true
            });
        }
    }
};

// Helper function to get current rank name
function getCurrentRank(member, staffRoles) {
    // List ranks from highest to lowest
    const rankOrder = [
        'director', 'deputyDirector', 'viceDeputyDirector', 'leadAssistantDirector', 'assistantDirector',
        'seniorManager', 'manager', 'trialManager',
        'leadStaffSupervisor', 'staffSupervisor', 'staffSupervisorInTraining',
        'internalAffairsDirector', 'internalAffairs', 'trialInternalAffairs',
        'headAdmin', 'seniorAdmin', 'admin', 'trialAdmin',
        'headModerator', 'seniorModerator', 'moderator', 'trialModerator'
    ];
    
    // Find the highest rank
    for (const rankKey of rankOrder) {
        if (member.roles.cache.has(staffRoles[rankKey].id)) {
            return staffRoles[rankKey].name;
        }
    }
    
    return 'Unknown Rank';
}