// commands/promote.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promote a staff member')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The staff member to promote')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for the promotion')
                .setRequired(true)),
    async execute(interaction, client) {
        try {
            // Get staff roles configuration
            const staffRoles = client.config.staffRoles;
            
            // Check if user has any Director rank roles
            // Updated to include all director roles (Assistant Director and above)
            const hasPermission = interaction.member.roles.cache.some(role => 
                [staffRoles.assistantDirector.id, staffRoles.leadAssistantDirector.id, 
                 staffRoles.viceDeputyDirector.id, staffRoles.deputyDirector.id, 
                 staffRoles.director.id].includes(role.id)
            );
            
            if (!hasPermission) {
                return interaction.reply({
                    content: 'You must be an Assistant Director or higher to use this command.',
                    ephemeral: true
                });
            }
            
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            
            // Verify reason length if required
            if (client.config.promotionSettings.requireReason && 
                reason.length < client.config.promotionSettings.minReasonLength) {
                return interaction.reply({
                    content: `Please provide a more detailed reason (at least ${client.config.promotionSettings.minReasonLength} characters).`,
                    ephemeral: true
                });
            }
            
            // Get the target member
            const guild = interaction.guild;
            let targetMember;
            try {
                targetMember = await guild.members.fetch(targetUser.id);
            } catch (error) {
                return interaction.reply({
                    content: 'The target user is not in the server.',
                    ephemeral: true
                });
            }
            
            // Get their current highest role
            const currentRole = getHighestStaffRole(targetMember, staffRoles);
            if (!currentRole) {
                return interaction.reply({
                    content: 'This user does not have any staff roles.',
                    ephemeral: true
                });
            }
            
            // Generate available promotion options
            const promotionOptions = [];
            
            // Define the rank order for the hierarchy
            const rankOrder = [
                'trialModerator', 'moderator', 'seniorModerator', 'headModerator',
                'trialAdmin', 'admin', 'seniorAdmin', 'headAdmin',
                'trialInternalAffairs', 'internalAffairs', 'internalAffairsDirector',
                'staffSupervisorInTraining', 'staffSupervisor', 'leadStaffSupervisor',
                'trialManager', 'manager', 'seniorManager',
                'assistantDirector', 'leadAssistantDirector', 'viceDeputyDirector', 'deputyDirector', 'director'
            ];
            
            // Find the current rank index
            const currentRankIndex = rankOrder.indexOf(currentRole.key);
            if (currentRankIndex === -1 || currentRankIndex === rankOrder.length - 1) {
                return interaction.reply({
                    content: `Cannot promote ${targetUser.tag}. Their current rank (${currentRole.name}) is either not found in the hierarchy or is already the highest rank.`,
                    ephemeral: true
                });
            }
            
            // Get promotion options
            // First, try roles in the same category
            const currentCategory = currentRole.category;
            let foundOptions = false;
            
            for (let i = currentRankIndex + 1; i < rankOrder.length; i++) {
                const nextRankKey = rankOrder[i];
                const nextRank = staffRoles[nextRankKey];
                
                if (nextRank && nextRank.category === currentCategory) {
                    promotionOptions.push({
                        label: nextRank.name,
                        value: nextRankKey,
                        description: `Promote to ${nextRank.name}`
                    });
                    foundOptions = true;
                } else if (foundOptions) {
                    // If we found options in the current category but now hit a different category, break
                    break;
                }
            }
            
            // If no options found in the same category, show the entry role of the next category
            if (promotionOptions.length === 0) {
                const categories = ['moderation', 'administration', 'internalAffairs', 'supervision', 'management', 'directive'];
                const currentCategoryIndex = categories.indexOf(currentCategory);
                
                if (currentCategoryIndex >= 0 && currentCategoryIndex < categories.length - 1) {
                    const nextCategory = categories[currentCategoryIndex + 1];
                    
                    // Find the lowest role in the next category
                    for (const rankKey of rankOrder) {
                        const rankData = staffRoles[rankKey];
                        if (rankData && rankData.category === nextCategory) {
                            promotionOptions.push({
                                label: rankData.name,
                                value: rankKey,
                                description: `Promote to ${rankData.name}`
                            });
                            break;
                        }
                    }
                }
            }
            
            if (promotionOptions.length === 0) {
                return interaction.reply({
                    content: 'There are no available promotion options for this user.',
                    ephemeral: true
                });
            }
            
            // Create promotion rank selection menu
            const promotionRanksRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`promotion_rank:${targetUser.id}:${reason}`)
                        .setPlaceholder('Select promotion rank')
                        .addOptions(promotionOptions)
                );
            
            // Create a preview embed for the promotion
            const previewEmbed = new EmbedBuilder()
                .setTitle('Staff Promotion')
                .setColor('#55FF55')
                .setDescription(`You are preparing a promotion for ${targetUser.tag}`)
                .addFields(
                    { name: 'Current Rank', value: currentRole.name, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setFooter({ text: 'Select the rank to promote to below' });
            
            return interaction.reply({
                embeds: [previewEmbed],
                components: [promotionRanksRow],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in promote command:', error);
            
            // Only reply if we haven't replied already
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content: 'There was an error while processing the promotion. Please try again.',
                    ephemeral: true
                });
            }
        }
    }
};

// Helper function to get the highest staff role a user has
function getHighestStaffRole(member, staffRoles) {
    // Define the rank order for the hierarchy (highest to lowest)
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
        const roleData = staffRoles[rankKey];
        if (roleData && member.roles.cache.has(roleData.id)) {
            return { key: rankKey, ...roleData };
        }
    }
    
    return null;
}