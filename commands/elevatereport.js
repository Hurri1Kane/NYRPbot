// commands/elevatereport.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('elevatereport')
        .setDescription('Elevate a report to higher-ranking staff')
        .addUserOption(option => 
            option.setName('reported_user')
                .setDescription('The staff member being reported')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('The reason for elevating the report')
                .setRequired(true)),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has staff team role
        const isStaff = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
        
        if (!isStaff) {
            return interaction.reply({
                content: 'You must be a staff member to use this command.',
                ephemeral: true
            });
        }
        
        // Check if we're in a ticket channel
        const channel = interaction.channel;
        const ticketData = await db.getTicketById(channel.id); // Lookup by channel ID for simplicity
        
        if (!ticketData || ticketData.category !== 'staff') {
            return interaction.reply({
                content: 'This command can only be used in a Staff Report ticket.',
                ephemeral: true
            });
        }
        
        const reportedUser = interaction.options.getUser('reported_user');
        const reason = interaction.options.getString('reason');
        
        // Get the reported member
        const guild = interaction.guild;
        let reportedMember;
        try {
            reportedMember = await guild.members.fetch(reportedUser.id);
        } catch (error) {
            return interaction.reply({
                content: 'The reported user is not in the server.',
                ephemeral: true
            });
        }
        
        // Check if reported user is a staff member
        const isReportedStaff = reportedMember.roles.cache.has(staffRoles.staffTeam.id);
        
        if (!isReportedStaff) {
            return interaction.reply({
                content: 'This command can only be used to report staff members.',
                ephemeral: true
            });
        }
        
        // Get the reported user's highest role
        const reportedRank = getHighestStaffRole(reportedMember, staffRoles);
        if (!reportedRank) {
            return interaction.reply({
                content: 'Could not determine the reported user\'s staff rank.',
                ephemeral: true
            });
        }
        
        try {
            // Create a new permission overwrites array based on reported user's rank
            const newPermissionOverwrites = [];
            
            // Copy the existing permission overwrites
            channel.permissionOverwrites.cache.forEach(overwrite => {
                newPermissionOverwrites.push({
                    id: overwrite.id,
                    allow: overwrite.allow,
                    deny: overwrite.deny
                });
            });
            
            // Determine which roles should be able to see the report
            let viewingRank;
            
            // Logic based on reported user's rank category
            switch (reportedRank.category) {
                case 'moderation':
                    // Moderators are reported to Administration+
                    viewingRank = 'administration';
                    break;
                    
                case 'administration':
                    // Administrators are reported to Internal Affairs+
                    viewingRank = 'internalAffairs';
                    break;
                    
                case 'internalAffairs':
                    // Internal Affairs are reported to Supervisors+
                    viewingRank = 'supervision';
                    break;
                    
                case 'supervision':
                case 'management':
                    // Supervisors and Managers are reported to Directors+
                    viewingRank = 'directive';
                    break;
                    
                case 'directive':
                    // Directors can only be reported to the Server Owner/Developers
                    // We'll keep this visible to Directive Team but log a special notification
                    viewingRank = 'directive';
                    break;
                    
                default:
                    viewingRank = 'internalAffairs';
            }
            
            // Remove view permission from the Staff Team role
            newPermissionOverwrites.push({
                id: staffRoles.staffTeam.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            });
            
            // Add view permission for the appropriate category role
            const categoryRoleKey = `${viewingRank}Category`;
            const categoryRole = staffRoles[categoryRoleKey] || staffRoles[viewingRank];
            
            if (categoryRole) {
                newPermissionOverwrites.push({
                    id: categoryRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                });
            }
            
            // Always allow the ticket creator to view
            if (ticketData.creatorId) {
                newPermissionOverwrites.push({
                    id: ticketData.creatorId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                });
            }
            
            // Update the channel permissions
            await channel.permissionOverwrites.set(newPermissionOverwrites);
            
            // Update ticket in database to mark as elevated
            await db.updateTicket(ticketData._id, {
                elevated: true,
                elevatedBy: interaction.user.id,
                elevatedAt: new Date().toISOString(),
                reportedUser: reportedUser.id,
                elevationReason: reason,
                viewingRank: viewingRank
            });
            
            // Send a message in the channel
            const embed = new EmbedBuilder()
                .setTitle('Report Elevated')
                .setColor('#FF5555')
                .setDescription(`This report against ${reportedUser.tag} has been elevated to ${viewingRank.charAt(0).toUpperCase() + viewingRank.slice(1)}+ level staff.`)
                .addFields(
                    { name: 'Reported User', value: reportedUser.tag, inline: true },
                    { name: 'Elevated By', value: interaction.user.tag, inline: true },
                    { name: 'Rank Category', value: reportedRank.category, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            
            await interaction.reply({
                embeds: [embed]
            });
            
            // Log the action
            const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
            if (staffLogChannel) {
                await staffLogChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Staff Action Log: Report Elevated')
                            .setColor('#FF5555')
                            .setDescription(`A staff report against ${reportedUser.tag} has been elevated by ${interaction.user.tag}`)
                            .addFields(
                                { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                                { name: 'Viewing Level', value: viewingRank.charAt(0).toUpperCase() + viewingRank.slice(1), inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            }
            
            // Special notification for Director reports
            if (reportedRank.category === 'directive') {
                try {
                    // Try to DM the server owner or a designated developer
                    const ownerId = guild.ownerId;
                    const owner = await client.users.fetch(ownerId);
                    
                    await owner.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('High-Level Report Notification')
                                .setColor('#FF0000')
                                .setDescription(`A report has been filed against a Director-level staff member.`)
                                .addFields(
                                    { name: 'Reported User', value: reportedUser.tag, inline: true },
                                    { name: 'Reported By', value: ticketData.creatorId ? `<@${ticketData.creatorId}>` : 'Unknown', inline: true },
                                    { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                                    { name: 'Elevated By', value: interaction.user.tag }
                                )
                                .setTimestamp()
                        ]
                    });
                } catch (dmError) {
                    console.log('Could not DM server owner:', dmError.message);
                }
            }
            
            // Add audit log
            await db.addAuditLog({
                actionType: 'REPORT_ELEVATED',
                userId: interaction.user.id,
                targetId: reportedUser.id,
                details: {
                    ticketId: ticketData._id,
                    channelId: channel.id,
                    reason: reason,
                    viewingRank: viewingRank
                }
            });
            
        } catch (error) {
            console.error('Error elevating report:', error);
            await interaction.reply({
                content: 'There was an error elevating this report. Please try again later.',
                ephemeral: true
            });
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