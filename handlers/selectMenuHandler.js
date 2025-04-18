// handlers/selectMenuHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/dbHandler');

/**
 * Select menu interaction handler for the NYRP Staff Management Bot
 * This handles all select menu interactions based on their customId
 */
module.exports = async function handleSelectMenuInteraction(interaction, client) {
    // Parse the customId to determine the action and parameters
    const [action, ...params] = interaction.customId.split(':');
    
    try {
        // Get staff roles for permission checking
        const staffRoles = client.config.staffRoles;
        
        // Process different select menu actions
        switch (action) {
            // Infraction type selection
                case 'infraction_type': {
                    const selectedType = interaction.values[0];
                    const targetUserId = params[0];
                    
                    // Get infraction data from client's temporary storage
                    if (!client.infractionData || !client.infractionData.has(targetUserId)) {
                        return interaction.update({
                            content: 'Infraction data not found. Please try creating the infraction again.',
                            components: []
                        });
                    }
                    
                    const infractionData = client.infractionData.get(targetUserId);
                    
                    // Check if appealable status has been set
                    if (infractionData.appealable === null) {
                        return interaction.update({
                            content: 'Please select whether the infraction is appealable before choosing the type.',
                            components: []
                        });
                    }
                    
                    // Update the infraction type
                    infractionData.type = selectedType;
                    client.infractionData.set(targetUserId, infractionData);
                    
                    // Create an infraction ID
                    const infractionId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    
                    // Create the infraction record
                    const infraction = {
                        _id: infractionId,
                        userId: targetUserId,
                        type: selectedType,
                        issuer: interaction.user.id,
                        reason: infractionData.reason,
                        evidence: infractionData.evidence,
                        appealable: infractionData.appealable,
                        timestamp: new Date().toISOString(),
                        status: 'pending_approval'
                    };
                    
                    // Add additional fields based on type
                    if (selectedType.startsWith('suspension_')) {
                        const durationMap = {
                            'suspension_24h': '24 hours',
                            'suspension_48h': '48 hours',
                            'suspension_72h': '72 hours',
                            'suspension_1w': '1 week',
                            'suspension_2w': '2 weeks'
                        };
                        infraction.duration = durationMap[selectedType];
                        
                        // Calculate expiry date
                        const expiry = new Date();
                        if (selectedType.endsWith('24h')) {
                            expiry.setHours(expiry.getHours() + 24);
                        } else if (selectedType.endsWith('48h')) {
                            expiry.setHours(expiry.getHours() + 48);
                        } else if (selectedType.endsWith('72h')) {
                            expiry.setHours(expiry.getHours() + 72);
                        } else if (selectedType.endsWith('1w')) {
                            expiry.setDate(expiry.getDate() + 7);
                        } else if (selectedType.endsWith('2w')) {
                            expiry.setDate(expiry.getDate() + 14);
                        }
                        infraction.expiry = expiry.toISOString();
                    }
                    
                    // Save infraction to database
                    await db.addInfraction(infraction);
                    
                    // Clean up temporary storage
                    client.infractionData.delete(targetUserId);
                    
                    // Format the infraction type for display
                    const formattedType = formatInfractionType(selectedType);
                    
                    // Fetch target user information
                    const targetUser = await client.users.fetch(targetUserId);
                    
                    // Send for Director approval
                    const approvalChannel = client.channels.cache.get(client.config.channels.infractionApproval);
                    if (approvalChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle(`Infraction Approval Required`)
                            .setColor('#FF5555')
                            .setDescription(`An infraction has been created by ${interaction.user.tag}`)
                            .addFields(
                                { name: 'Target', value: targetUser.tag, inline: true },
                                { name: 'Type', value: formattedType, inline: true },
                                { name: 'Appealable', value: infraction.appealable ? '✅ Yes' : '❌ No', inline: true },
                                { name: 'Reason', value: infraction.reason }
                            );
                        
                        // Add evidence field if provided
                        if (infraction.evidence && infraction.evidence.length > 0) {
                            embed.addFields({
                                name: 'Evidence',
                                value: infraction.evidence.map((link, index) => `[Evidence ${index + 1}](${link})`).join('\n')
                            });
                        }
                        
                        // Add duration field if applicable
                        if (selectedType.startsWith('suspension_')) {
                            embed.addFields({ name: 'Duration', value: infraction.duration, inline: true });
                        }
                        
                        embed.setTimestamp();
                        
                        const buttons = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`infraction_approve:${infractionId}`)
                                    .setLabel('Approve')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId(`infraction_deny:${infractionId}`)
                                    .setLabel('Deny')
                                    .setStyle(ButtonStyle.Danger)
                            );
                        
                        await approvalChannel.send({ embeds: [embed], components: [buttons] });
                    }
                    
                    // Update the original interaction
                    await interaction.update({
                        content: `Infraction created and sent for Director approval. Type: ${formattedType}, Appealable: ${infraction.appealable ? 'Yes' : 'No'}`,
                        components: []
                    });
                    
                    // Add audit log
                    await db.addAuditLog({
                        actionType: 'INFRACTION_CREATED',
                        userId: interaction.user.id,
                        targetId: targetUserId,
                        details: {
                            infractionId: infractionId,
                            type: selectedType,
                            reason: infraction.reason,
                            appealable: infraction.appealable,
                            evidence: infraction.evidence
                        }
                    });
                    
                    break;
                }
            
            // Promotion rank selection
            case 'promotion_rank': {
                const selectedRankKey = interaction.values[0];
                const targetUserId = params[0];
                
                // If there are more parameters, join them back together for the reason
                let reason = '';
                if (params.length > 1) {
                    reason = params.slice(1).join(':');
                }
                
                // Verify if user has Director rank
                const hasPermission = interaction.member.roles.cache.has(staffRoles.director.id);
                
                if (!hasPermission) {
                    return interaction.update({
                        content: 'You must be a Director to promote staff members.',
                        components: []
                    });
                }
                
                // Get target member
                const guild = interaction.guild;
                let targetMember;
                try {
                    targetMember = await guild.members.fetch(targetUserId);
                } catch (error) {
                    return interaction.update({
                        content: 'The target user is no longer in the server.',
                        components: []
                    });
                }
                
                // Get their current highest role
                const currentRole = getHighestStaffRole(targetMember, staffRoles);
                if (!currentRole) {
                    return interaction.update({
                        content: 'This user no longer has any staff roles.',
                        components: []
                    });
                }
                
                // Get the new role
                const newRole = staffRoles[selectedRankKey];
                if (!newRole) {
                    return interaction.update({
                        content: 'The selected rank could not be found in the configuration.',
                        components: []
                    });
                }
                
                try {
                    // Create a promotion ID
                    const promotionId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    
                    // Create promotion record
                    const promotion = {
                        _id: promotionId,
                        staffId: targetUserId,
                        oldRank: currentRole.key,
                        oldRankName: currentRole.name,
                        newRank: selectedRankKey,
                        newRankName: newRole.name,
                        reason: reason,
                        promoter: interaction.user.id,
                        timestamp: new Date().toISOString()
                    };
                    
                    // Save promotion to database
                    await db.addPromotion(promotion);
                    
                    // Remove current rank role
                    await targetMember.roles.remove(currentRole.id);
                    
                    // Add new rank role
                    await targetMember.roles.add(newRole.id);
                    
                    // Update category roles if needed
                    if (currentRole.category !== newRole.category) {
                        // Remove old category role if it exists
                        const oldCategoryRoleKey = `${currentRole.category}Category`;
                        const oldCategoryRole = staffRoles[oldCategoryRoleKey] || 
                                              staffRoles[currentRole.category];
                        
                        if (oldCategoryRole && targetMember.roles.cache.has(oldCategoryRole.id)) {
                            await targetMember.roles.remove(oldCategoryRole.id);
                        }
                        
                        // Add new category role if it exists
                        const newCategoryRoleKey = `${newRole.category}Category`;
                        const newCategoryRole = staffRoles[newCategoryRoleKey] || 
                                              staffRoles[newRole.category];
                        
                        if (newCategoryRole) {
                            await targetMember.roles.add(newCategoryRole.id);
                        }
                    }
                    
                    // Update special category roles (High Rank, Senior High Rank, etc.)
                    await updateSpecialCategoryRoles(targetMember, newRole.category, staffRoles);
                    
                    // Announce the promotion
                    const promotionChannel = client.channels.cache.get(client.config.channels.promotionAnnouncement);
                    if (promotionChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle(`Staff Promotion`)
                            .setColor('#55FF55')
                            .setDescription(`${targetMember.user.tag} has been promoted!`)
                            .addFields(
                                { name: 'From', value: currentRole.name, inline: true },
                                { name: 'To', value: newRole.name, inline: true },
                                { name: 'Promoted By', value: interaction.user.tag, inline: true },
                                { name: 'Reason', value: reason }
                            )
                            .setTimestamp();
                        
                        await promotionChannel.send({ 
                            content: `Congratulations <@${targetMember.id}>!`,
                            embeds: [embed] 
                        });
                    }
                    
                    // Update interaction
                    await interaction.update({
                        content: `Successfully promoted ${targetMember.user.tag} from ${currentRole.name} to ${newRole.name}.`,
                        components: []
                    });
                    
                    // Log the action
                    const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
                    if (staffLogChannel) {
                        await staffLogChannel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Staff Action Log: Promotion')
                                    .setColor('#55FF55')
                                    .setDescription(`${targetMember.user.tag} was promoted`)
                                    .addFields(
                                        { name: 'From', value: currentRole.name, inline: true },
                                        { name: 'To', value: newRole.name, inline: true },
                                        { name: 'Promoted By', value: interaction.user.tag, inline: true }
                                    )
                                    .setTimestamp()
                            ]
                        });
                    }
                    
                    // Add audit log
                    await db.addAuditLog({
                        actionType: 'PROMOTION',
                        userId: interaction.user.id,
                        targetId: targetUserId,
                        details: {
                            promotionId: promotionId,
                            oldRank: currentRole.name,
                            newRank: newRole.name,
                            reason: reason
                        }
                    });
                    
                    // Try to DM the promoted user if configured
                    if (client.config.promotionSettings.dmPromoted) {
                        try {
                            await targetMember.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('You Have Been Promoted!')
                                        .setColor('#55FF55')
                                        .setDescription(`Congratulations! You have been promoted in the NYRP Staff Team.`)
                                        .addFields(
                                            { name: 'From', value: currentRole.name, inline: true },
                                            { name: 'To', value: newRole.name, inline: true },
                                            { name: 'Promoted By', value: interaction.user.tag, inline: true },
                                            { name: 'Reason', value: reason }
                                        )
                                        .setTimestamp()
                                ]
                            });
                        } catch (dmError) {
                            console.log(`Could not DM user ${targetMember.id} about promotion:`, dmError.message);
                        }
                    }
                    
                } catch (error) {
                    console.error('Error during promotion:', error);
                    return interaction.update({
                        content: 'There was an error processing this promotion.',
                        components: []
                    });
                }
                
                break;
            }
            
            // Ticket priority selection
            case 'ticket_priority': {
                const ticketId = params[0];
                const selectedPriority = interaction.values[0]; // 'low', 'medium', or 'high'
                
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
                        content: 'This ticket could not be found.',
                        ephemeral: true
                    });
                }
                
                // Update ticket priority
                await db.updateTicket(ticketId, {
                    priority: selectedPriority
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
                    .setColor(priorityColors[selectedPriority])
                    .spliceFields(2, 1, { name: 'Priority', value: priorityNames[selectedPriority], inline: true });
                
                await interaction.update({
                    embeds: [ticketEmbed]
                });
                
                // Notify in the channel
                await interaction.followUp({
                    content: `${interaction.user} has set this ticket's priority to **${priorityNames[selectedPriority]}**.`
                });
                
                // Add audit log
                await db.addAuditLog({
                    actionType: 'TICKET_PRIORITY_CHANGED',
                    userId: interaction.user.id,
                    targetId: ticket.creatorId,
                    details: {
                        ticketId: ticketId,
                        channelId: ticket.channelId,
                        priority: selectedPriority
                    }
                });
                
                break;
            }
            
            // Handle office deletion selection
            case 'office_delete': {
                await handleOfficeDelete(interaction, client, params);
                break;
            }
            
            // Add more select menu handlers as needed for other functionality...
            
            default:
                console.log(`Unknown select menu action: ${action}`);
                await interaction.reply({
                    content: 'This selection is not recognized.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error(`Error handling select menu ${action}:`, error);
        
        // Try to respond to the interaction
        try {
            const errorMessage = {
                content: 'There was an error processing this selection!',
                ephemeral: true
            };
            
            if (interaction.replied) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            console.error('Error responding to select menu interaction:', replyError);
        }
    }
};

/**
 * Handle office deletion selection
 */
async function handleOfficeDelete(interaction, client, params) {
    const officeId = params[0];
    const staffRoles = client.config.staffRoles;
    const action = interaction.values[0]; // 'keep', 'delete_24h', or 'delete_now'
    
    // Check if user has permission
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
        
        const channel = interaction.channel;
        
        switch (action) {
            case 'keep':
                // Update the database to mark that we've decided to keep the channel
                await db.updateOffice(officeId, {
                    deletionScheduled: false,
                    deletionAction: 'keep'
                });
                
                await interaction.reply({
                    content: 'This office channel will be kept open for reference.',
                    ephemeral: false
                });
                break;
                
            case 'delete_24h':
                // Schedule deletion for 24 hours later
                const deletionTime = new Date();
                deletionTime.setHours(deletionTime.getHours() + 24);
                
                await db.updateOffice(officeId, {
                    deletionScheduled: true,
                    deletionTime: deletionTime.toISOString(),
                    deletionAction: 'delete_24h'
                });
                
                await interaction.reply({
                    content: `This office channel will be deleted in 24 hours (${deletionTime.toLocaleString()}).`,
                    ephemeral: false
                });
                break;
                
            case 'delete_now':
                // Update the database to mark that we're deleting now
                await db.updateOffice(officeId, {
                    deletionScheduled: true,
                    deletionTime: new Date().toISOString(),
                    deletionAction: 'delete_now'
                });
                
                await interaction.reply({
                    content: 'This office channel will be deleted in 10 seconds...',
                    ephemeral: false
                });
                
                // Add audit log
                await db.addAuditLog({
                    actionType: 'OFFICE_DELETED',
                    userId: interaction.user.id,
                    targetId: office.targetId,
                    details: {
                        officeId: officeId,
                        channelId: channel.id
                    }
                });
                
                // Set timeout to delete channel
                setTimeout(async () => {
                    try {
                        await channel.delete();
                    } catch (deleteError) {
                        console.error('Error deleting office channel:', deleteError);
                    }
                }, 10000); // 10 seconds
                break;
                
            default:
                await interaction.reply({
                    content: 'Unknown action selected.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error handling office deletion:', error);
        await interaction.reply({
            content: 'There was an error processing your request. Please try again later.',
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

// Get the highest staff role a user has
function getHighestStaffRole(member, staffRoles) {
    const rankOrder = [
        'director', 'deputyDirector', 'viceDeputyDirector', 'leadAssistantDirector', 'assistantDirector',
        'seniorManager', 'manager', 'trialManager',
        'leadStaffSupervisor', 'staffSupervisor', 'staffSupervisorInTraining',
        'internalAffairsDirector', 'internalAffairs', 'trialInternalAffairs',
        'headAdmin', 'seniorAdmin', 'admin', 'trialAdmin',
        'headModerator', 'seniorModerator', 'moderator', 'trialModerator'
    ];
    
    for (const rankKey of rankOrder) {
        const roleData = staffRoles[rankKey];
        if (roleData && member.roles.cache.has(roleData.id)) {
            return { key: rankKey, ...roleData };
        }
    }
    
    return null;
}

// Update special category roles based on new category
async function updateSpecialCategoryRoles(member, newCategory, staffRoles) {
    // Map of categories to special roles
    const specialRoles = {
        'internalAffairs': staffRoles.highRank.id,
        'supervision': staffRoles.seniorHighRank.id,
        'management': staffRoles.seniorHighRank.id,
        'directive': staffRoles.directiveTeam.id
    };
    
    try {
        // Add special roles based on new category
        if (specialRoles[newCategory]) {
            await member.roles.add(specialRoles[newCategory]);
        }
        
        // For Supervisor level and above, add Senior High Rank
        if (['supervision', 'management', 'directive'].includes(newCategory)) {
            await member.roles.add(staffRoles.seniorHighRank.id);
        }
        
        // For Internal Affairs and above, add High Rank
        if (['internalAffairs', 'supervision', 'management', 'directive'].includes(newCategory)) {
            await member.roles.add(staffRoles.highRank.id);
        }
    } catch (error) {
        console.error('Error updating special category roles:', error);
        throw error;
    }
}