// handlers/buttonHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/dbHandler');

/**
 * Button interaction handler for the NYRP Staff Management Bot
 * This handles all button interactions based on their customId
 */
module.exports = async function handleButtonInteraction(interaction, client) {
    // Parse the customId to determine the action and parameters
    const [action, ...params] = interaction.customId.split(':');
    
    try {
        // Defer the reply to give us time to process
        // Only defer for actions that might take time
        const longProcessingActions = ['infraction_approve', 'infraction_deny', 'ticket_close', 'office_close'];
        if (longProcessingActions.includes(action)) {
            await interaction.deferUpdate();
        }
        
        // Get staff roles for permission checking
        const staffRoles = client.config.staffRoles;
        
        // Process different button actions
        switch (action) {
            // Infraction approval button
            case 'infraction_approve': {
                const infractionId = params[0];
                
                // Check if user has Director rank
                const hasPermission = interaction.member.roles.cache.has(staffRoles.director.id);
                
                if (!hasPermission) {
                    return interaction.editReply({
                        content: 'You must be a Director to approve infractions.',
                        ephemeral: true
                    });
                }
                
                // Get the infraction from database
                const infraction = await db.getInfractionById(infractionId);
                if (!infraction) {
                    return interaction.editReply({
                        content: 'This infraction could not be found.',
                        ephemeral: true
                    });
                }
                
                // Update infraction status
                await db.updateInfractionStatus(infractionId, 'active', {
                    approvedBy: interaction.user.id,
                    approvedAt: new Date().toISOString()
                });
                
                // Get the target member
                const guild = interaction.guild;
                let targetMember;
                try {
                    targetMember = await guild.members.fetch(infraction.userId);
                } catch (error) {
                    return interaction.editReply({
                        content: 'The target user is no longer in the server.',
                        ephemeral: true
                    });
                }
                
                // Apply the infraction
                try {
                    switch (infraction.type) {
                        case 'warning':
                            // No role changes for warnings
                            break;
                            
                        case 'suspension_24h':
                        case 'suspension_48h':
                        case 'suspension_72h':
                        case 'suspension_1w':
                        case 'suspension_2w': {
                            // Store current roles for restoration later
                            const previousRoles = targetMember.roles.cache
                                .filter(role => 
                                    Object.values(staffRoles).some(staffRole => staffRole.id === role.id)
                                )
                                .map(role => role.id);
                            
                            // Save previous roles to the infraction
                            await db.updateInfractionStatus(infractionId, 'active', {
                                previousRoles: previousRoles
                            });
                            
                            // Remove staff roles and add suspended role
                            for (const roleData of Object.values(staffRoles)) {
                                if (targetMember.roles.cache.has(roleData.id) && 
                                    roleData.id !== staffRoles.suspended.id) {
                                    await targetMember.roles.remove(roleData.id);
                                }
                            }
                            await targetMember.roles.add(staffRoles.suspended.id);
                            break;
                        }
                        
                        case 'demotion':
                            // Would handle demotion specifically based on current rank
                            // This is simplified for example purposes
                            break;
                            
                        case 'blacklist':
                            // Remove all staff roles and add blacklisted role
                            for (const roleData of Object.values(staffRoles)) {
                                if (targetMember.roles.cache.has(roleData.id) && 
                                    roleData.id !== staffRoles.blacklisted.id) {
                                    await targetMember.roles.remove(roleData.id);
                                }
                            }
                            await targetMember.roles.add(staffRoles.blacklisted.id);
                            break;
                            
                        case 'under_investigation':
                            // Add under investigation role
                            await targetMember.roles.add(staffRoles.underInvestigation.id);
                            break;
                    }
                    
                    // Format the infraction type for display
                    const formattedType = formatInfractionType(infraction.type);
                    
                    // Announce the infraction
                    const announcementChannel = client.channels.cache.get(client.config.channels.infractionAnnouncement);
                    if (announcementChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle(`Staff Infraction Issued`)
                            .setColor('#FF5555')
                            .setDescription(`An infraction has been issued to ${targetMember.user.tag}`)
                            .addFields(
                                { name: 'Type', value: formattedType, inline: true },
                                { name: 'Issued By', value: `<@${infraction.issuer}>`, inline: true },
                                { name: 'Approved By', value: `<@${interaction.user.id}>`, inline: true },
                                { name: 'Reason', value: infraction.reason },
                                infraction.duration ? 
                                    { name: 'Duration', value: infraction.duration, inline: true } : 
                                    { name: '\u200B', value: '\u200B', inline: true }
                            )
                            .setTimestamp();
                        
                        await announcementChannel.send({ embeds: [embed] });
                    }
                    
                    // Update approval message
                    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setTitle('Infraction Approved')
                        .setColor('#55FF55')
                        .setFooter({ text: `Approved by ${interaction.user.tag}` });
                    
                    await interaction.editReply({
                        embeds: [originalEmbed],
                        components: []
                    });
                    
                    // Log the action
                    const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
                    if (staffLogChannel) {
                        await staffLogChannel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Staff Action Log: Infraction Applied')
                                    .setColor('#FF99AA')
                                    .setDescription(`Infraction applied to ${targetMember.user.tag}`)
                                    .addFields(
                                        { name: 'Type', value: formattedType, inline: true },
                                        { name: 'Approved By', value: interaction.user.tag, inline: true }
                                    )
                                    .setTimestamp()
                            ]
                        });
                    }
                    
                    // Add audit log
                    await db.addAuditLog({
                        actionType: 'INFRACTION_APPROVED',
                        userId: interaction.user.id,
                        targetId: infraction.userId,
                        details: {
                            infractionId: infractionId,
                            type: infraction.type,
                            reason: infraction.reason
                        }
                    });
                    
                } catch (error) {
                    console.error('Error applying infraction:', error);
                    return interaction.editReply({
                        content: 'There was an error applying this infraction.',
                        ephemeral: true
                    });
                }
                break;
            }
            
            // Infraction denial button
            case 'infraction_deny': {
                const infractionId = params[0];
                
                // Check if user has Director rank
                const hasPermission = interaction.member.roles.cache.has(staffRoles.director.id);
                
                if (!hasPermission) {
                    return interaction.editReply({
                        content: 'You must be a Director to deny infractions.',
                        ephemeral: true
                    });
                }
                
                // Get the infraction from database
                const infraction = await db.getInfractionById(infractionId);
                if (!infraction) {
                    return interaction.editReply({
                        content: 'This infraction could not be found.',
                        ephemeral: true
                    });
                }
                
                // Update infraction status
                await db.updateInfractionStatus(infractionId, 'denied', {
                    deniedBy: interaction.user.id,
                    deniedAt: new Date().toISOString()
                });
                
                // Update approval message
                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setTitle('Infraction Denied')
                    .setColor('#555555')
                    .setFooter({ text: `Denied by ${interaction.user.tag}` });
                
                await interaction.editReply({
                    embeds: [originalEmbed],
                    components: []
                });
                
                // Notify the issuer
                try {
                    const issuer = await client.users.fetch(infraction.issuer);
                    await issuer.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Infraction Denied')
                                .setColor('#555555')
                                .setDescription(`Your infraction request has been denied by ${interaction.user.tag}`)
                                .addFields(
                                    { name: 'Target', value: `<@${infraction.userId}>`, inline: true },
                                    { name: 'Type', value: formatInfractionType(infraction.type), inline: true },
                                    { name: 'Reason', value: infraction.reason }
                                )
                                .setTimestamp()
                        ]
                    });
                } catch (dmError) {
                    console.error(`Could not DM user ${infraction.issuer}:`, dmError);
                }
                
                // Log the action
                const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
                if (staffLogChannel) {
                    await staffLogChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Staff Action Log: Infraction Denied')
                                .setColor('#AAAAAA')
                                .setDescription(`Infraction against <@${infraction.userId}> was denied`)
                                .addFields(
                                    { name: 'Type', value: formatInfractionType(infraction.type), inline: true },
                                    { name: 'Denied By', value: interaction.user.tag, inline: true }
                                )
                                .setTimestamp()
                        ]
                    });
                }
                
                // Add audit log
                await db.addAuditLog({
                    actionType: 'INFRACTION_DENIED',
                    userId: interaction.user.id,
                    targetId: infraction.userId,
                    details: {
                        infractionId: infractionId,
                        type: infraction.type,
                        reason: infraction.reason
                    }
                });
                
                break;
            }
            
            // Ticket claim button
            case 'ticket_claim': {
                const ticketId = params[0];
                
                // Check if user has staff team role
                const hasPermission = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
                
                if (!hasPermission) {
                    return interaction.reply({
                        content: 'You must be a staff member to claim tickets.',
                        ephemeral: true
                    });
                }
                
                // Get the ticket from database
                const ticket = await db.getTicketById(ticketId);
                if (!ticket) {
                    return interaction.reply({
                        content: 'This ticket could not be found.',
                        ephemeral: true
                    });
                }
                
                // Check if ticket is already claimed
                if (ticket.claimedBy) {
                    return interaction.reply({
                        content: `This ticket is already claimed by <@${ticket.claimedBy}>.`,
                        ephemeral: true
                    });
                }
                
                // Update ticket data
                await db.updateTicket(ticketId, {
                    claimedBy: interaction.user.id,
                    claimedAt: new Date().toISOString()
                });
                
                // Update ticket message
                const ticketEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor('#4CAF50')
                    .spliceFields(1, 1, { name: 'Status', value: `Claimed by ${interaction.user.tag}`, inline: true });
                
                await interaction.update({
                    embeds: [ticketEmbed]
                });
                
                // Notify in the channel
                await interaction.followUp({
                    content: `${interaction.user} has claimed this ticket.`
                });
                
                // Add audit log
                await db.addAuditLog({
                    actionType: 'TICKET_CLAIMED',
                    userId: interaction.user.id,
                    targetId: ticket.creatorId,
                    details: {
                        ticketId: ticketId,
                        channelId: ticket.channelId
                    }
                });
                
                break;
            }
            
            // Add more button handlers as needed for other functionality...
            
            default:
                console.log(`Unknown button action: ${action}`);
                await interaction.reply({
                    content: 'This button action is not recognized.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error(`Error handling button ${action}:`, error);
        
        // Try to respond to the interaction
        try {
            const errorMessage = {
                content: 'There was an error processing this button!',
                ephemeral: true
            };
            
            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            console.error('Error responding to button interaction:', replyError);
        }
    }
};

// Helper function to format infraction type for display
function formatInfractionType(type) {
    if (type.startsWith('suspension_')) {
        const durationMap = {
            'suspension_24h': '24 hours',
            'suspension_48h': '48 hours',
            'suspension_72h': '72 hours',
            'suspension_1w': '1 week',
            'suspension_2w': '2 weeks'
        };
        return `Suspension (${durationMap[type] || type.split('_')[1]})`;
    }
    
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
}