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

            case 'office_outcome':
                await handleOfficeOutcome(interaction, client, params);
                break;

            case 'office_delete_options':
                await handleOfficeDeleteOptions(interaction, client, params);
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

// [EXISTING TICKET FUNCTIONS: handleTicketCreate, handleTicketClaim, handleTicketPriority, etc.]
// Include the existing ticket functions here...

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
        // Update office status to closed
        await db.updateOffice(officeId, {
            status: 'closed',
            closedBy: interaction.user.id,
            closedAt: new Date().toISOString()
        });
        
        // Create confirmation message
        const confirmationEmbed = new EmbedBuilder()
            .setTitle('Office Closed')
            .setDescription(`This Internal Affairs Office has been closed by ${interaction.user.tag}.`)
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
        
        const deleteOptionsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`office_delete_options:${officeId}`)
                    .setLabel('Manage Channel Deletion')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        // Send confirmation message
        await interaction.reply({
            embeds: [confirmationEmbed],
            components: [outcomeRow, deleteOptionsRow]
        });
        
        // Log the office close action
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            await staffLogChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Staff Action Log: Office Closed')
                        .setColor('#FF5555')
                        .setDescription(`Internal Affairs Office for <@${office.targetId}> has been closed by ${interaction.user.tag}`)
                        .addFields(
                            { name: 'Office ID', value: officeId, inline: true },
                            { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        }
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'OFFICE_CLOSED',
            userId: interaction.user.id,
            targetId: office.targetId,
            details: {
                officeId: officeId,
                channelId: interaction.channel.id
            }
        });
        
    } catch (error) {
        console.error('Error closing office:', error);
        await interaction.reply({
            content: 'There was an error closing this office. Please try again later.',
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

/**
 * Handle office outcome selection
 */
async function handleOfficeOutcome(interaction, client, params) {
    const officeId = params[0];
    const outcome = params[1]; // 'no_action', 'warning', or 'infraction'
    const staffRoles = client.config.staffRoles;
    
    // Check if user has Internal Affairs or higher rank
    const hasPermission = interaction.member.roles.cache.some(role => 
        [staffRoles.internalAffairs.id, staffRoles.internalAffairsDirector.id, 
         staffRoles.highRank.id, staffRoles.seniorHighRank.id].includes(role.id)
    );
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be an Internal Affairs member or higher to set office outcomes.',
            ephemeral: true
        });
    }
    
    try {
        // Get the office from database
        const office = await db.getOfficeById(officeId);
        if (!office) {
            return interaction.reply({
                content: 'This office could not be found in the database.',
                ephemeral: true
            });
        }
        
        // Ensure office is closed
        if (office.status !== 'closed') {
            return interaction.reply({
                content: 'This office must be closed before setting an outcome.',
                ephemeral: true
            });
        }
        
        // Update the office with the outcome
        await db.updateOffice(officeId, {
            outcome: outcome,
            outcomeDeterminedBy: interaction.user.id,
            outcomeDeterminedAt: new Date().toISOString()
        });
        
        // Handle different outcomes
        switch (outcome) {
            case 'no_action':
                await interaction.reply({
                    content: 'This office has been marked as "No Action Required".',
                    ephemeral: false
                });
                break;
                
            case 'warning':
                // For warnings, we'll create an informal record but not a formal infraction
                await interaction.reply({
                    content: 'This office has been marked as "Warning". The user has been warned but no formal infraction has been created.',
                    ephemeral: false
                });
                
                // Try to DM the user about the warning
                try {
                    const targetUser = await client.users.fetch(office.targetId);
                    const warningEmbed = new EmbedBuilder()
                        .setTitle('Official Warning')
                        .setColor('#FFA500')
                        .setDescription('You have received an official warning from Internal Affairs.')
                        .addFields(
                            { name: 'Case Reference', value: officeId },
                            { name: 'Warning By', value: interaction.user.tag }
                        )
                        .setTimestamp();
                        
                    await targetUser.send({ embeds: [warningEmbed] });
                } catch (dmError) {
                    console.log(`Could not DM user ${office.targetId} about warning:`, dmError.message);
                }
                break;
                
            case 'infraction':
                // For infractions, we'll redirect them to create a formal infraction
                // Create infraction button
                const createInfractionButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`create_infraction:${office.targetId}:${officeId}`)
                            .setLabel('Create Formal Infraction')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                await interaction.reply({
                    content: 'This office has been marked for "Infraction". Please create a formal infraction using the button below or the `/infract` command.',
                    components: [createInfractionButton],
                    ephemeral: false
                });
                break;
                
            default:
                await interaction.reply({
                    content: 'Unknown outcome selected.',
                    ephemeral: true
                });
        }
        
        // Log the outcome
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            const outcomeMap = {
                'no_action': 'No Action Required',
                'warning': 'Warning Issued',
                'infraction': 'Formal Infraction Required'
            };
            
            await staffLogChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Staff Action Log: Office Outcome')
                        .setColor('#FF7700')
                        .setDescription(`Outcome determined for Internal Affairs Office for <@${office.targetId}>`)
                        .addFields(
                            { name: 'Office ID', value: officeId, inline: true },
                            { name: 'Outcome', value: outcomeMap[outcome] || outcome, inline: true },
                            { name: 'Determined By', value: interaction.user.tag, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        }
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'OFFICE_OUTCOME_SET',
            userId: interaction.user.id,
            targetId: office.targetId,
            details: {
                officeId: officeId,
                outcome: outcome
            }
        });
        
    } catch (error) {
        console.error('Error setting office outcome:', error);
        await interaction.reply({
            content: 'There was an error setting the office outcome. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle office deletion options display
 */
async function handleOfficeDeleteOptions(interaction, client, params) {
    const officeId = params[0];
    const staffRoles = client.config.staffRoles;
    
    // Check if user has Internal Affairs or higher rank
    const hasPermission = interaction.member.roles.cache.some(role => 
        [staffRoles.internalAffairs.id, staffRoles.internalAffairsDirector.id, 
         staffRoles.highRank.id, staffRoles.seniorHighRank.id].includes(role.id)
    );
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be an Internal Affairs member or higher to manage office deletion.',
            ephemeral: true
        });
    }
    
    try {
        // Get the office data
        const office = await db.getOfficeById(officeId);
        if (!office) {
            return interaction.reply({
                content: 'This office could not be found in the database.',
                ephemeral: true
            });
        }
        
        // Ensure the office is closed
        if (office.status !== 'closed') {
            return interaction.reply({
                content: 'This office must be closed before it can be deleted.',
                ephemeral: true
            });
        }
        
        // Create the deletion options selection menu
        const deleteOptionsRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`office_delete:${officeId}`)
                    .setPlaceholder('Select deletion option')
                    .addOptions([
                        { 
                            label: 'Keep Channel', 
                            value: 'keep', 
                            description: 'Keep this channel for reference',
                            emoji: '📁'
                        },
                        { 
                            label: 'Delete in 24 Hours', 
                            value: 'delete_24h', 
                            description: 'Schedule deletion for 24 hours from now',
                            emoji: '⏱️'
                        },
                        { 
                            label: 'Delete Now', 
                            value: 'delete_now', 
                            description: 'Delete this channel immediately',
                            emoji: '🗑️'
                        }
                    ])
            );
        
        // Create explanation embed
        const explanationEmbed = new EmbedBuilder()
            .setTitle('Manage Office Channel')
            .setDescription('Please select what you would like to do with this office channel:')
            .setColor('#FF5555')
            .addFields(
                { 
                    name: 'Keep Channel', 
                    value: 'The channel will remain available for reference and can be accessed in the future.'
                },
                { 
                    name: 'Delete in 24 Hours', 
                    value: 'The channel will be automatically deleted after 24 hours, giving time for any final reviews.'
                },
                { 
                    name: 'Delete Now', 
                    value: 'The channel will be deleted immediately after a 10-second countdown.'
                }
            )
            .setFooter({ text: 'Please make your selection below' });
        
        // Send the message with the selection menu
        await interaction.reply({
            embeds: [explanationEmbed],
            components: [deleteOptionsRow],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error displaying office deletion options:', error);
        await interaction.reply({
            content: 'There was an error displaying deletion options. Please try again later.',
            ephemeral: true
        });
    }
}

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

// [INCLUDE EXISTING FUNCTIONS: handleInfractionApprove, handleInfractionDeny, etc.]
// Include the remaining handler functions here...

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