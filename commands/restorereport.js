// commands/restorereport.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restorereport')
        .setDescription('Restore normal permissions for an elevated report'),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Internal Affairs or higher rank
        const hasPermission = interaction.member.roles.cache.some(role => 
            [staffRoles.internalAffairsDirector.id, staffRoles.highRank.id,
             staffRoles.seniorHighRank.id].includes(role.id)
        );
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be Internal Affairs Director or higher to use this command.',
                ephemeral: true
            });
        }
        
        // Check if we're in a ticket channel
        const channel = interaction.channel;
        const ticketData = await db.getTicketById(channel.id);
        
        if (!ticketData) {
            return interaction.reply({
                content: 'This command can only be used in a ticket channel.',
                ephemeral: true
            });
        }
        
        // Check if the ticket is elevated
        if (!ticketData.elevated) {
            return interaction.reply({
                content: 'This ticket has not been elevated. Use `/elevatereport` first.',
                ephemeral: true
            });
        }
        
        try {
            // Create a new permission overwrites array for normal staff visibility
            const newPermissionOverwrites = [];
            
            // Copy existing permission overwrites that aren't related to staff roles
            channel.permissionOverwrites.cache.forEach(overwrite => {
                // Skip staff-related roles as we'll re-add them
                if (!Object.values(staffRoles).some(role => role.id === overwrite.id)) {
                    newPermissionOverwrites.push({
                        id: overwrite.id,
                        allow: overwrite.allow,
                        deny: overwrite.deny
                    });
                }
            });
            
            // Add the standard Staff Team permission
            newPermissionOverwrites.push({
                id: staffRoles.staffTeam.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
            });
            
            // Always ensure the ticket creator can view
            if (ticketData.creatorId) {
                newPermissionOverwrites.push({
                    id: ticketData.creatorId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                });
            }
            
            // Update the channel permissions
            await channel.permissionOverwrites.set(newPermissionOverwrites);
            
            // Update ticket in database to mark as no longer elevated
            await db.updateTicket(ticketData._id, {
                elevated: false,
                restoredBy: interaction.user.id,
                restoredAt: new Date().toISOString(),
            });
            
            // Send a message in the channel
            const embed = new EmbedBuilder()
                .setTitle('Report Visibility Restored')
                .setColor('#55FF55')
                .setDescription('This report has been restored to normal visibility for all staff members.')
                .addFields(
                    { name: 'Restored By', value: interaction.user.tag },
                    { name: 'Note', value: 'All staff members can now view and respond to this ticket.' }
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
                            .setTitle('Staff Action Log: Report Visibility Restored')
                            .setColor('#55FF55')
                            .setDescription(`A staff report in ${channel.name} has been restored to normal visibility by ${interaction.user.tag}`)
                            .addFields(
                                { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                                { name: 'Ticket ID', value: ticketData._id, inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            }
            
            // Add audit log
            await db.addAuditLog({
                actionType: 'REPORT_RESTORED',
                userId: interaction.user.id,
                details: {
                    ticketId: ticketData._id,
                    channelId: channel.id,
                    reportedUser: ticketData.reportedUser
                }
            });
            
        } catch (error) {
            console.error('Error restoring report visibility:', error);
            await interaction.reply({
                content: 'There was an error restoring the report visibility. Please try again later.',
                ephemeral: true
            });
        }
    }
};