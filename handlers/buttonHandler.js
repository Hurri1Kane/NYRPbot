// handlers/buttonHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/dbHandler');

/**
 * Button interaction handler for the NYRP Staff Management Bot
 * This handles all button interactions based on their customId
 */
module.exports = async function handleButtonInteraction(interaction, client) {
    // Parse the customId to determine the action and parameters
    const [action, ...params] = interaction.customId.split(':');
    
    try {
        // Get staff roles for permission checking
        const staffRoles = client.config.staffRoles;
        
        // Process different button actions
        switch (action) {
            // =============================
            // TICKET SYSTEM BUTTONS
            // =============================
            
            case 'ticket_create':
                await handleTicketCreate(interaction, client, params);
                break;
                
            case 'ticket_claim':
                await handleTicketClaim(interaction, client, params);
                break;
                
            case 'ticket_priority_low':
            case 'ticket_priority_medium':
            case 'ticket_priority_high':
                await handleTicketPriority(interaction, client, action, params);
                break;
                
            case 'ticket_close':
                await handleTicketClose(interaction, client, params);
                break;
                
            case 'ticket_transcript':
                await handleTicketTranscript(interaction, client, params);
                break;
                
            case 'ticket_delete':
                await handleTicketDelete(interaction, client, params);
                break;

            // =============================
            // APPEALABLE/NON-APPEALABLE BUTTONS
            // =============================

            case 'appealable':
                await handleAppealableSelection(interaction, client, params);
                break;
                
            // Then add this function at the bottom of the file:

            /**
             * Handle the selection of whether an infraction is appealable or not
             */
            async function handleAppealableSelection(interaction, client, params) {
                const targetUserId = params[0];
                const isAppealable = params[1] === 'true';
                
                // Get infraction data from temporary storage
                if (!client.infractionData || !client.infractionData.has(targetUserId)) {
                    return interaction.reply({
                        content: 'Infraction data not found. Please try creating the infraction again.',
                        ephemeral: true
                    });
                }
                
                const infractionData = client.infractionData.get(targetUserId);
                
                // Update the appealable status
                infractionData.appealable = isAppealable;
                client.infractionData.set(targetUserId, infractionData);
                
                // Get target user information
                const targetUser = await client.users.fetch(targetUserId);
                
                // Create infraction type selection menu
                const infractionTypesRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`infraction_type:${targetUserId}`)
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
                
                // Create a new preview embed
                const previewEmbed = new EmbedBuilder()
                    .setTitle('Create Staff Infraction')
                    .setColor('#FF5555')
                    .setDescription(`You are creating an infraction for ${targetUser.tag}`)
                    .addFields(
                        { name: 'Target', value: targetUser.tag, inline: true },
                        { name: 'Appealable', value: isAppealable ? '✅ Yes' : '❌ No', inline: true },
                        { name: 'Reason', value: infractionData.reason }
                    );
                
                // Add evidence field if provided
                if (infractionData.evidence && infractionData.evidence.length > 0) {
                    previewEmbed.addFields({
                        name: 'Evidence',
                        value: infractionData.evidence.map((link, index) => `[Evidence ${index + 1}](${link})`).join('\n')
                    });
                }
                
                previewEmbed.setFooter({ text: 'Select an infraction type to continue' });
                
                // Update the message
                await interaction.update({
                    embeds: [previewEmbed],
                    components: [infractionTypesRow]
                });
            }
            
            // =============================
            // INFRACTION SYSTEM BUTTONS
            // =============================
            
            case 'infraction_approve':
                await handleInfractionApprove(interaction, client, params);
                break;
                
            case 'infraction_deny':
                await handleInfractionDeny(interaction, client, params);
                break;
                
            // =============================
            // OFFICE SYSTEM BUTTONS
            // =============================
            
            case 'office_close':
                await handleOfficeClose(interaction, client, params);
                break;
                
            case 'office_transcript':
                await handleOfficeTranscript(interaction, client, params);
                break;
                
            // Default case for unknown buttons
            default:
                console.log(`Unknown button action: ${action}`);
                await interaction.reply({
                    content: 'This button action is not recognized.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error(`Error handling button ${action}:`, error);
        
        // Try to respond to the interaction with a friendly error message
        try {
            const errorMessage = {
                content: 'There was an error processing this button. Please try again or contact a system administrator.',
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

/**
 * Handle ticket creation from button
 */
async function handleTicketCreate(interaction, client, params) {
    const categoryId = params[0];
    
    // Get staff roles and configuration
    const staffRoles = client.config.staffRoles;
    const ticketCategories = client.config.ticketCategories;
    
    // Find the category data
    const categoryData = ticketCategories.find(c => c.id === categoryId) || {
        name: 'Support',
        emoji: '❓'
    };
    
    // Create a ticket ID
    const ticketId = `ticket-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Create ticket channel name (sanitized)
    const channelName = `${categoryId}-${interaction.user.username.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
    
    // Check if user already has an open ticket
    const existingTickets = await db.getUserActiveTickets(interaction.user.id);
    if (existingTickets && existingTickets.length > 0) {
        return interaction.reply({
            content: `You already have an open ticket: <#${existingTickets[0].channelId}>. Please use that one instead or close it before opening a new one.`,
            ephemeral: true
        });
    }
    
    // Defer the reply since channel creation might take time
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // Create ticket channel
        const guild = interaction.guild;
        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: 0, // Text channel
            parent: client.config.channels.ticketCategory,
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone role
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                },
                {
                    id: staffRoles.staffTeam.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }
            ]
        });
        
        // Create ticket buttons
        const ticketButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_claim:${ticketId}`)
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`ticket_close:${ticketId}`)
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );
        
        // Create priority buttons
        const priorityRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_priority_low:${ticketId}`)
                    .setLabel('Low Priority')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔵'),
                new ButtonBuilder()
                    .setCustomId(`ticket_priority_medium:${ticketId}`)
                    .setLabel('Medium Priority')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🟠'),
                new ButtonBuilder()
                    .setCustomId(`ticket_priority_high:${ticketId}`)
                    .setLabel('High Priority')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔴')
            );
        
        // Send initial message in ticket channel
        const embed = new EmbedBuilder()
            .setTitle(`${categoryData.emoji} ${categoryData.name} Ticket: ${ticketId}`)
            .setColor('#3498DB')
            .setDescription(`Ticket created by ${interaction.user.tag}`)
            .addFields(
                { name: 'Status', value: 'Open', inline: true },
                { name: 'Priority', value: 'Medium', inline: true },
                { name: 'Created', value: new Date().toISOString(), inline: true }
            )
            .setFooter({ text: 'Staff can use the buttons below to manage this ticket.' });
        
        const ticketMessage = await ticketChannel.send({
            content: `<@${interaction.user.id}> A staff member will assist you shortly.\n\nPlease describe your issue in detail so our team can help you more effectively.`,
            embeds: [embed],
            components: [ticketButtons, priorityRow]
        });
        
        // Save ticket information to database
        const ticketData = {
            _id: ticketId,
            channelId: ticketChannel.id,
            messageId: ticketMessage.id,
            creatorId: interaction.user.id,
            reason: `Created from ticket panel (${categoryData.name})`,
            category: categoryId,
            status: 'open',
            priority: 'medium',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            claimedBy: null,
            closedBy: null
        };
        
        await db.addTicket(ticketData);
        
        // Reply to the interaction
        await interaction.editReply({
            content: `Your ticket has been created! Please check ${ticketChannel}`,
            ephemeral: true
        });
        
        // Log the ticket creation
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            await staffLogChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Staff Action Log: Ticket Created')
                        .setColor('#3498DB')
                        .setDescription(`New ${categoryData.name} ticket created by ${interaction.user.tag}`)
                        .addFields(
                            { name: 'Ticket ID', value: ticketId, inline: true },
                            { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        }
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'TICKET_CREATED',
            userId: interaction.user.id,
            details: {
                ticketId: ticketId,
                channelId: ticketChannel.id,
                category: categoryId
            }
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.editReply({
            content: 'There was an error creating your ticket. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket claiming
 */
async function handleTicketClaim(interaction, client, params) {
    const ticketId = params[0];
    const staffRoles = client.config.staffRoles;
    
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
            content: 'This ticket could not be found in the database.',
            ephemeral: true
        });
    }
    
    // Check if ticket is already claimed
    if (ticket.claimedBy) {
        // If claimed by someone else
        if (ticket.claimedBy !== interaction.user.id) {
            return interaction.reply({
                content: `This ticket is already claimed by <@${ticket.claimedBy}>.`,
                ephemeral: true
            });
        }
        // If already claimed by the same user
        return interaction.reply({
            content: `You have already claimed this ticket.`,
            ephemeral: true
        });
    }
    
    try {
        // Update ticket data
        await db.updateTicket(ticketId, {
            claimedBy: interaction.user.id,
            claimedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        });
        
        // Update ticket message embed
        const ticketEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#4CAF50')
            .spliceFields(0, 1, { name: 'Status', value: `Claimed by ${interaction.user.tag}`, inline: true });
        
        // Get first component row with the claim button, and disable it
        const components = interaction.message.components;
        const firstRow = ActionRowBuilder.from(components[0]);
        const claimButton = firstRow.components.find(c => c.data.custom_id.startsWith('ticket_claim'));
        if (claimButton) {
            claimButton.setDisabled(true);
        }
        
        // Create new components array with updated first row and unchanged second row
        const updatedComponents = [
            firstRow,
            ...components.slice(1)
        ];
        
        await interaction.update({
            embeds: [ticketEmbed],
            components: updatedComponents
        });
        
        // Notify in the channel
        await interaction.channel.send({
            content: `${interaction.user} has claimed this ticket and will be assisting you.`
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
    } catch (error) {
        console.error('Error claiming ticket:', error);
        await interaction.reply({
            content: 'There was an error claiming this ticket. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket priority
 */
async function handleTicketPriority(interaction, client, action, params) {
    const ticketId = params[0];
    const priority = action.split('_')[2]; // 'low', 'medium', or 'high'
    const staffRoles = client.config.staffRoles;
    
    // Check if user has staff team role
    const hasPermission = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be a staff member to set ticket priority.',
            ephemeral: true
        });
    }
    
    // Get the ticket from database
    const ticket = await db.getTicketById(ticketId);
    if (!ticket) {
        return interaction.reply({
            content: 'This ticket could not be found in the database.',
            ephemeral: true
        });
    }
    
    try {
        // Update ticket priority in database
        await db.updateTicket(ticketId, {
            priority: priority,
            lastActivity: new Date().toISOString()
        });
        
        // Get priority color
        const priorityColors = {
            'low': '#3498DB',    // Blue
            'medium': '#F39C12', // Orange
            'high': '#E74C3C'    // Red
        };
        
        // Format priority name
        const priorityNames = {
            'low': 'Low',
            'medium': 'Medium',
            'high': 'High'
        };
        
        // Update ticket message
        const ticketEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(priorityColors[priority])
            .spliceFields(1, 1, { name: 'Priority', value: priorityNames[priority], inline: true });
        
        await interaction.update({
            embeds: [ticketEmbed]
        });
        
        // Notify in the channel
        await interaction.channel.send({
            content: `${interaction.user} has set this ticket's priority to **${priorityNames[priority]}**.`
        });
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'TICKET_PRIORITY_CHANGED',
            userId: interaction.user.id,
            targetId: ticket.creatorId,
            details: {
                ticketId: ticketId,
                channelId: ticket.channelId,
                priority: priority
            }
        });
    } catch (error) {
        console.error('Error setting ticket priority:', error);
        await interaction.reply({
            content: 'There was an error setting the ticket priority. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket closing
 */
async function handleTicketClose(interaction, client, params) {
    const ticketId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Get the ticket from database
    const ticket = await db.getTicketById(ticketId);
    if (!ticket) {
        return interaction.reply({
            content: 'This ticket could not be found in the database.',
            ephemeral: true
        });
    }
    
    // Check permissions - allow staff or the ticket creator to close
    const isStaff = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
    const isCreator = interaction.user.id === ticket.creatorId;
    
    if (!isStaff && !isCreator) {
        return interaction.reply({
            content: 'You do not have permission to close this ticket.',
            ephemeral: true
        });
    }
    
    try {
        // Update ticket status in database
        await db.updateTicket(ticketId, {
            status: 'closed',
            closedBy: interaction.user.id,
            closedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        });
        
        // Create confirmation message
        const closingEmbed = new EmbedBuilder()
            .setTitle('Ticket Closing')
            .setDescription(`This ticket is being closed by ${interaction.user.tag}.`)
            .setColor('#E74C3C')
            .setTimestamp();
        
        // Create transcript button
        const transcriptRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_transcript:${ticketId}`)
                    .setLabel('Generate Transcript')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`ticket_delete:${ticketId}`)
                    .setLabel('Delete Channel')
                    .setStyle(ButtonStyle.Danger)
            );
        
        await interaction.reply({
            embeds: [closingEmbed],
            components: [transcriptRow]
        });
        
        // Disable all buttons in the original message
        const components = interaction.message.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            newRow.components.forEach(component => {
                component.setDisabled(true);
            });
            return newRow;
        });
        
        // Update original message
        const ticketEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#E74C3C')
            .spliceFields(0, 1, { name: 'Status', value: `Closed by ${interaction.user.tag}`, inline: true });
        
        await interaction.message.edit({
            embeds: [ticketEmbed],
            components: components
        });
        
        // Log the ticket closure
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            await staffLogChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Staff Action Log: Ticket Closed')
                        .setColor('#E74C3C')
                        .setDescription(`Ticket closed by ${interaction.user.tag}`)
                        .addFields(
                            { name: 'Ticket ID', value: ticketId, inline: true },
                            { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        }
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'TICKET_CLOSED',
            userId: interaction.user.id,
            targetId: ticket.creatorId,
            details: {
                ticketId: ticketId,
                channelId: ticket.channelId
            }
        });
    } catch (error) {
        console.error('Error closing ticket:', error);
        await interaction.reply({
            content: 'There was an error closing this ticket. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket transcript generation
 */
async function handleTicketTranscript(interaction, client, params) {
    const ticketId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Check if user has staff team role
    const hasPermission = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be a staff member to generate ticket transcripts.',
            ephemeral: true
        });
    }
    
    // Defer reply as this might take some time
    await interaction.deferReply();
    
    try {
        // Get the ticket from database
        const ticket = await db.getTicketById(ticketId);
        if (!ticket) {
            return interaction.editReply({
                content: 'This ticket could not be found in the database.',
                ephemeral: true
            });
        }
        
        // Create transcript
        const discordTranscripts = require('discord-html-transcripts');
        const channel = interaction.channel;
        
        const transcript = await discordTranscripts.createTranscript(channel, {
            limit: -1, // No limit
            fileName: `transcript-${ticketId}.html`,
            saveImages: true,
            footerText: `Transcript of ticket ${ticketId}`,
            poweredBy: false
        });
        
        // Send transcript to staff log channel
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            await staffLogChannel.send({
                content: `Transcript for ticket ${ticketId}`,
                files: [transcript]
            });
        }
        
        // Reply with transcript
        await interaction.editReply({
            content: 'Transcript generated successfully!',
            files: [transcript]
        });
        
        // Try to DM the ticket creator with the transcript
        try {
            const creator = await client.users.fetch(ticket.creatorId);
            await creator.send({
                content: `Here is the transcript for your ticket (ID: ${ticketId}):`,
                files: [transcript]
            });
        } catch (dmError) {
            console.log(`Could not DM ticket creator with transcript: ${dmError.message}`);
        }
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'TICKET_TRANSCRIPT_GENERATED',
            userId: interaction.user.id,
            targetId: ticket.creatorId,
            details: {
                ticketId: ticketId,
                channelId: ticket.channelId
            }
        });
    } catch (error) {
        console.error('Error generating transcript:', error);
        await interaction.editReply({
            content: 'There was an error generating the transcript. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket channel deletion
 */
async function handleTicketDelete(interaction, client, params) {
    const ticketId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Check if user has staff team role
    const hasPermission = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be a staff member to delete ticket channels.',
            ephemeral: true
        });
    }
    
    try {
        // Get the ticket from database
        const ticket = await db.getTicketById(ticketId);
        if (!ticket) {
            return interaction.reply({
                content: 'This ticket could not be found in the database.',
                ephemeral: true
            });
        }
        
        // Ensure ticket is closed before deletion
        if (ticket.status !== 'closed') {
            return interaction.reply({
                content: 'You must close the ticket before deleting the channel.',
                ephemeral: true
            });
        }
        
        // Notify that channel will be deleted
        await interaction.reply({
            content: 'This ticket channel will be deleted in 5 seconds...',
            ephemeral: true
        });
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'TICKET_CHANNEL_DELETED',
            userId: interaction.user.id,
            targetId: ticket.creatorId,
            details: {
                ticketId: ticketId,
                channelId: ticket.channelId
            }
        });
        
        // Set timeout to delete channel
        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (deleteError) {
                console.error('Error deleting ticket channel:', deleteError);
            }
        }, 5000);
    } catch (error) {
        console.error('Error deleting ticket channel:', error);
        await interaction.reply({
            content: 'There was an error deleting this channel. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle infraction approval
 */
async function handleInfractionApprove(interaction, client, params) {
    const infractionId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Defer the reply to give us time to process
    await interaction.deferUpdate();
    
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
                    { name: 'Appealable', value: infraction.appealable ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Reason', value: infraction.reason }
                );
                
            // Add evidence if available
            if (infraction.evidence && infraction.evidence.length > 0) {
                embed.addFields({
                    name: 'Evidence',
                    value: infraction.evidence.map((link, index) => `[Evidence ${index + 1}](${link})`).join('\n')
                });
            }
                
            // Add duration if applicable
            if (infraction.duration) {
                embed.addFields({ name: 'Duration', value: infraction.duration, inline: true });
            }
                
            embed.setTimestamp();
            
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
                            { name: 'Approved By', value: interaction.user.tag, inline: true },
                            { name: 'Appealable', value: infraction.appealable ? '✅ Yes' : '❌ No', inline: true }
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
                reason: infraction.reason,
                appealable: infraction.appealable,
                evidence: infraction.evidence
            }
        });
        
        // Send a direct message to the target user about their infraction
        try {
            const appealableText = infraction.appealable 
                ? "This infraction is appealable. You may contact the Director team to appeal this decision."
                : "This infraction is NOT appealable. The decision is final.";
                
            const dmEmbed = new EmbedBuilder()
                .setTitle(`Infraction Notification`)
                .setColor('#FF5555')
                .setDescription(`You have received a staff infraction.`)
                .addFields(
                    { name: 'Type', value: formattedType, inline: true },
                    { name: 'Issued By', value: `<@${infraction.issuer}>`, inline: true },
                    { name: 'Reason', value: infraction.reason },
                    { name: 'Appeal Status', value: appealableText }
                );
                
            // Add evidence if available
            if (infraction.evidence && infraction.evidence.length > 0) {
                dmEmbed.addFields({
                    name: 'Evidence',
                    value: infraction.evidence.map((link, index) => `[Evidence ${index + 1}](${link})`).join('\n')
                });
            }
                
            // Add duration if applicable
            if (infraction.duration) {
                dmEmbed.addFields({ name: 'Duration', value: infraction.duration, inline: true });
            }
                
            dmEmbed.setTimestamp();
            
            await targetMember.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            console.log(`Could not DM user ${targetMember.id} about their infraction:`, dmError.message);
        }
        
    } catch (error) {
        console.error('Error applying infraction:', error);
        return interaction.editReply({
            content: 'There was an error applying this infraction.',
            ephemeral: true
        });
    }
}

/**
 * Handle infraction denial
 */
async function handleInfractionDeny(interaction, client, params) {
    const infractionId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Defer the reply to give us time to process
    await interaction.deferUpdate();
    
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
}

/**
 * Handle office closing
 */
async function handleOfficeClose(interaction, client, params) {
    const officeId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Check if user has Internal Affairs or higher rank
    const hasPermission = interaction.member.roles.cache.some(role => 
        [staffRoles.internalAffairs.id, staffRoles.internalAffairsDirector.id, 
         staffRoles.highRank.id, staffRoles.seniorHighRank.id].includes(role.id)
    );
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be an Internal Affairs member or higher to close offices.',
            ephemeral: true
        });
    }
    
    // Get the office from database
    const office = await db.getOfficeById(officeId);
    if (!office) {
        return interaction.reply({
            content: 'This office could not be found in the database.',
            ephemeral: true
        });
    }
    
    // Ensure office is open
    if (office.status !== 'open') {
        return interaction.reply({
            content: 'This office is already closed.',
            ephemeral: true
        });
    }
    
    try {
        // Create confirmation message
        const confirmationEmbed = new EmbedBuilder()
            .setTitle('Office Outcome')
            .setDescription('Please select the outcome of this Internal Affairs Office:')
            .setColor('#FF5555')
            .setTimestamp();
        
        // Create outcome selection buttons
        const outcomeRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`office_outcome:${officeId}:no_action`)
                    .setLabel('No Action')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`office_outcome:${officeId}:warning`)
                    .setLabel('Warning')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`office_outcome:${officeId}:infraction`)
                    .setLabel('Infraction')
                    .setStyle(ButtonStyle.Danger)
            );
        
        // Send confirmation message
        await interaction.reply({
            embeds: [confirmationEmbed],
            components: [outcomeRow],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error handling office close:', error);
        await interaction.reply({
            content: 'There was an error processing your request. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle office transcript generation
 */
async function handleOfficeTranscript(interaction, client, params) {
    const officeId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Check if user has Internal Affairs or higher rank
    const hasPermission = interaction.member.roles.cache.some(role => 
        [staffRoles.internalAffairs.id, staffRoles.internalAffairsDirector.id, 
         staffRoles.highRank.id, staffRoles.seniorHighRank.id].includes(role.id)
    );
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be an Internal Affairs member or higher to generate office transcripts.',
            ephemeral: true
        });
    }
    
    // Defer reply as this might take some time
    await interaction.deferReply();
    
    try {
        // Get the office from database
        const office = await db.getOfficeById(officeId);
        if (!office) {
            return interaction.editReply({
                content: 'This office could not be found in the database.',
                ephemeral: true
            });
        }
        
        // Create transcript
        const discordTranscripts = require('discord-html-transcripts');
        const channel = interaction.channel;
        
        const transcript = await discordTranscripts.createTranscript(channel, {
            limit: -1, // No limit
            fileName: `transcript-office-${officeId}.html`,
            saveImages: true,
            footerText: `Transcript of Internal Affairs Office ${officeId}`,
            poweredBy: false
        });
        
        // Send transcript to staff log channel
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            await staffLogChannel.send({
                content: `Transcript for Internal Affairs Office ${officeId}`,
                files: [transcript]
            });
        }
        
        // Reply with transcript
        await interaction.editReply({
            content: 'Office transcript generated successfully!',
            files: [transcript]
        });
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'OFFICE_TRANSCRIPT_GENERATED',
            userId: interaction.user.id,
            targetId: office.targetId,
            details: {
                officeId: officeId,
                channelId: office.channelId
            }
        });
    } catch (error) {
        console.error('Error generating office transcript:', error);
        await interaction.editReply({
            content: 'There was an error generating the transcript. Please try again later.',
            ephemeral: true
        });
    }
}

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