// commands/ticket.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, PermissionsBitField } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets')
    .addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new ticket')
            .addStringOption(option => 
                option.setName('reason')
                    .setDescription('The reason for opening the ticket')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('category')
                    .setDescription('The ticket category')
                    .setRequired(true)
                    .addChoices(
                        { name: 'General Support', value: 'general' },
                        { name: 'In-Game Report', value: 'ingame' },
                        { name: 'Staff Report', value: 'staff' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a user to the ticket')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('The user to add')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('reason')
                    .setDescription('The reason for adding the user')
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a user from the ticket')
            .addUserOption(option => 
                option.setName('user')
                    .setDescription('The user to remove')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('reason')
                    .setDescription('The reason for removing the user')
                    .setRequired(false))),
async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    // Get staff roles and channels configuration
    const staffRoles = client.config.staffRoles;
    const ticketCategories = client.config.ticketCategories;
    
    switch (subcommand) {
        case 'create':
            await handleTicketCreate(interaction, client);
            break;
        case 'add':
            await handleTicketAdd(interaction, client);
            break;
        case 'remove':
            await handleTicketRemove(interaction, client);
            break;
        default:
            await interaction.reply({
                content: 'Unknown subcommand.',
                ephemeral: true
            });
    }
}
};

// Handle ticket creation
async function handleTicketCreate(interaction, client) {
const reason = interaction.options.getString('reason');
const category = interaction.options.getString('category');

// Get staff roles and configuration
const staffRoles = client.config.staffRoles;
const ticketCategories = client.config.ticketCategories;

// Find the category data
const categoryData = ticketCategories.find(c => c.id === category) || {
    name: 'Support',
    emoji: '❓'
};

// Create a ticket ID
const ticketId = `ticket-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;

// Create ticket channel name (sanitized)
const channelName = `${category}-${interaction.user.username.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

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
                deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
                id: interaction.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
            },
            {
                id: staffRoles.staffTeam.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
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
                .setCustomId(`ticket_priority:${ticketId}`)
                .setLabel('Set Priority')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`ticket_close:${ticketId}`)
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );
    
    // Create priority select menu
    const priorityRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_priority_low:${ticketId}`)
                .setLabel('Low')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔵'),
            new ButtonBuilder()
                .setCustomId(`ticket_priority_medium:${ticketId}`)
                .setLabel('Medium')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🟠'),
            new ButtonBuilder()
                .setCustomId(`ticket_priority_high:${ticketId}`)
                .setLabel('High')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔴')
        );
    
    // Send initial message in ticket channel
    const embed = new EmbedBuilder()
        .setTitle(`${categoryData.emoji} ${categoryData.name} Ticket: ${ticketId}`)
        .setColor('#3498DB')
        .setDescription(`Ticket created by ${interaction.user.tag}`)
        .addFields(
            { name: 'Reason', value: reason },
            { name: 'Status', value: 'Open', inline: true },
            { name: 'Priority', value: 'Medium', inline: true },
            { name: 'Created', value: new Date().toISOString(), inline: true }
        )
        .setFooter({ text: 'Staff can use the buttons below to manage this ticket.' });
    
    const ticketMessage = await ticketChannel.send({
        content: `<@${interaction.user.id}> A staff member will assist you shortly.`,
        embeds: [embed],
        components: [ticketButtons, priorityRow]
    });
    
    // Save ticket information to database
    const ticketData = {
        _id: ticketId,
        channelId: ticketChannel.id,
        messageId: ticketMessage.id,
        creatorId: interaction.user.id,
        reason: reason,
        category: category,
        status: 'open',
        priority: 'medium',
        createdAt: new Date().toISOString(),
        claimedBy: null,
        closedBy: null
    };
    
    await db.addTicket(ticketData);
    
    // Reply to the interaction
    await interaction.reply({
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
            category: category,
            reason: reason
        }
    });
    
} catch (error) {
    console.error('Error creating ticket:', error);
    await interaction.reply({
        content: 'There was an error creating your ticket. Please try again later.',
        ephemeral: true
    });
}
}

// Handle adding user to ticket
async function handleTicketAdd(interaction, client) {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason') || 'No reason provided';

// Check if this is a ticket channel
const channel = interaction.channel;
const ticketData = await db.getTicketById(channel.id); // Temporary simple lookup by channel ID

if (!ticketData) {
    return interaction.reply({
        content: 'This command can only be used in an active ticket channel.',
        ephemeral: true
    });
}

// Check if user is staff or the ticket creator
const staffRoles = client.config.staffRoles;
const isStaff = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
const isCreator = interaction.user.id === ticketData.creatorId;

if (!isStaff && !isCreator) {
    return interaction.reply({
        content: 'You do not have permission to add users to this ticket.',
        ephemeral: true
    });
}

try {
    // Add user to channel permissions
    await channel.permissionOverwrites.create(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
    });
    
    // Update ticket in database
    await db.updateTicket(ticketData._id, {
        participants: [...(ticketData.participants || []), targetUser.id]
    });
    
    // Notify in the channel
    await interaction.reply({
        content: `${interaction.user} added ${targetUser} to the ticket.\nReason: ${reason}`
    });
    
    // Add audit log
    await db.addAuditLog({
        actionType: 'TICKET_USER_ADDED',
        userId: interaction.user.id,
        targetId: targetUser.id,
        details: {
            ticketId: ticketData._id,
            channelId: channel.id,
            reason: reason
        }
    });
    
} catch (error) {
    console.error('Error adding user to ticket:', error);
    await interaction.reply({
        content: 'There was an error adding the user to this ticket.',
        ephemeral: true
    });
}
}

// Handle removing user from ticket
async function handleTicketRemove(interaction, client) {
const targetUser = interaction.options.getUser('user');
const reason = interaction.options.getString('reason') || 'No reason provided';

// Check if this is a ticket channel
const channel = interaction.channel;
const ticketData = await db.getTicketById(channel.id); // Temporary simple lookup by channel ID

if (!ticketData) {
    return interaction.reply({
        content: 'This command can only be used in an active ticket channel.',
        ephemeral: true
    });
}

// Check if user is staff
const staffRoles = client.config.staffRoles;
const isStaff = interaction.member.roles.cache.has(staffRoles.staffTeam.id);

if (!isStaff) {
    return interaction.reply({
        content: 'You do not have permission to remove users from this ticket.',
        ephemeral: true
    });
}

// Prevent removing the ticket creator
if (targetUser.id === ticketData.creatorId) {
    return interaction.reply({
        content: 'You cannot remove the ticket creator from the ticket.',
        ephemeral: true
    });
}

try {
    // Remove user from channel permissions
    const permissionOverwrites = channel.permissionOverwrites.cache.get(targetUser.id);
    if (permissionOverwrites) {
        await permissionOverwrites.delete();
    }
    
    // Update ticket in database
    const participants = ticketData.participants || [];
    await db.updateTicket(ticketData._id, {
        participants: participants.filter(id => id !== targetUser.id)
    });
    
    // Notify in the channel
    await interaction.reply({
        content: `${interaction.user} removed ${targetUser} from the ticket.\nReason: ${reason}`
    });
    
    // Add audit log
    await db.addAuditLog({
        actionType: 'TICKET_USER_REMOVED',
        userId: interaction.user.id,
        targetId: targetUser.id,
        details: {
            ticketId: ticketData._id,
            channelId: channel.id,
            reason: reason
        }
    });
    
} catch (error) {
    console.error('Error removing user from ticket:', error);
    await interaction.reply({
        content: 'There was an error removing the user from this ticket.',
        ephemeral: true
    });
}
}