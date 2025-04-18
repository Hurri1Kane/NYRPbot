// commands/infract.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

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
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Internal Affairs or higher rank
        // Now also include all director roles
        const hasPermission = interaction.member.roles.cache.some(role => 
            [staffRoles.trialInternalAffairs.id, staffRoles.internalAffairs.id, 
             staffRoles.internalAffairsDirector.id, staffRoles.highRank.id,
             staffRoles.seniorHighRank.id, staffRoles.assistantDirector.id, 
             staffRoles.leadAssistantDirector.id, staffRoles.viceDeputyDirector.id, 
             staffRoles.deputyDirector.id, staffRoles.director.id].includes(role.id)
        );
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be Trial Internal Affairs or higher to use this command.',
                ephemeral: true
            });
        }
        
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const evidence = interaction.options.getString('evidence') || 'No evidence provided';
        
        // Get the target member
        const guild = interaction.guild;
        const targetMember = await guild.members.fetch(targetUser.id);
        
        // Check if target has staff team role
        const isStaff = targetMember.roles.cache.has(staffRoles.staffTeam.id);
        
        if (!isStaff) {
            return interaction.reply({
                content: 'The target user is not a staff member.',
                ephemeral: true
            });
        }
        
        // Create infraction selection menu
        const infractionTypesRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`infraction_type:${targetUser.id}`)
                    .setPlaceholder('Select infraction type')
                    .addOptions([
                        { label: 'Warning', value: 'warning', description: 'Formal warning with no additional consequences' },
                        { label: 'Suspension (24h)', value: 'suspension_24h', description: 'Suspend for 24 hours' },
                        { label: 'Suspension (48h)', value: 'suspension_48h', description: 'Suspend for 48 hours' },
                        { label: 'Suspension (72h)', value: 'suspension_72h', description: 'Suspend for 72 hours' },
                        { label: 'Suspension (1 week)', value: 'suspension_1w', description: 'Suspend for 1 week' },
                        { label: 'Suspension (2 weeks)', value: 'suspension_2w', description: 'Suspend for 2 weeks' },
                        { label: 'Demotion', value: 'demotion', description: 'Reduce to a lower rank' },
                        { label: 'Blacklist', value: 'blacklist', description: 'Permanent removal from staff team' },
                        { label: 'Under Investigation', value: 'under_investigation', description: 'Place under investigation' }
                    ])
            );
        
        // Store the reason and evidence in the client's temporary storage for access when the menu is used
        if (!client.infractionReasons) {
            client.infractionReasons = new Map();
        }
        if (!client.infractionEvidence) {
            client.infractionEvidence = new Map();
        }
        client.infractionReasons.set(targetUser.id, reason);
        client.infractionEvidence.set(targetUser.id, evidence);
        
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
            .setFooter({ text: 'Select an infraction type below' });
        
        await interaction.reply({
            embeds: [previewEmbed],
            components: [infractionTypesRow],
            ephemeral: true
        });
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