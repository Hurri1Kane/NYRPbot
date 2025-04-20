// src/discord/commands/infraction/ticketCommand.js
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
  } = require('discord.js');
  const { PERMISSION_PRESETS } = require('../../utils/permissionManager');
  const ErrorHandler = require('../../../utils/errorHandler');
  const logger = require('../../../utils/logger');
  const Ticket = require('../../../database/models/Ticket');
  const User = require('../../../database/models/User');
  const AuditLog = require('../../../database/models/AuditLog');
  const { roleIds, roleNames } = require('../../../config/roles');
  const { channelIds, channelConfig } = require('../../../config/channels');
  const config = require('../../../config/config');
  const { safeReply, safeDefer } = require('../../events/interactionCreate');
  const { generateTranscript } = require('../../utils/transcriptGenerator');
  
  // Counter to track tickets (will be initialized from DB)
  let ticketCounter = 0;
  
  // Initialize ticket counter from DB
  async function initTicketCounter() {
    try {
      const latestTicket = await Ticket.findOne({}).sort({ createdAt: -1 }).limit(1);
      if (latestTicket && latestTicket.ticketId) {
        // Extract the number from the ticket ID (format: TICKET-1234)
        const match = latestTicket.ticketId.match(/TICKET-(\d+)/);
        if (match && match[1]) {
          ticketCounter = parseInt(match[1], 10);
        } else {
          ticketCounter = 1000; // Default if no match found
        }
      } else {
        ticketCounter = 1000; // Default if no tickets exist
      }
      logger.info(`Initialized ticket counter: ${ticketCounter}`);
    } catch (error) {
      logger.error(`Failed to initialize ticket counter: ${error.message}`);
      // Start from 1000 as a safe default
      ticketCounter = 1000;
    }
  }
  
  // Initialize the counter
  initTicketCounter();
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Manage support tickets')
      .addSubcommand(subcommand => 
        subcommand
          .setName('create')
          .setDescription('Create a new support ticket')
          .addStringOption(option => 
            option
              .setName('category')
              .setDescription('Ticket category')
              .setRequired(true)
              .addChoices(
                { name: 'General Support', value: 'General Support' },
                { name: 'In-Game Reports', value: 'In-Game Reports' },
                { name: 'Staff Reports', value: 'Staff Reports' }
              )
          )
          .addStringOption(option => 
            option
              .setName('subject')
              .setDescription('Brief subject of the ticket')
              .setRequired(true)
          )
          .addStringOption(option => 
            option
              .setName('description')
              .setDescription('Detailed description of your issue')
              .setRequired(true)
          )
          .addStringOption(option => 
            option
              .setName('priority')
              .setDescription('Ticket priority')
              .setRequired(false)
              .addChoices(
                { name: 'Low', value: 'Low' },
                { name: 'Medium', value: 'Medium' },
                { name: 'High', value: 'High' }
              )
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('close')
          .setDescription('Close a ticket (run in the ticket channel)')
          .addStringOption(option => 
            option
              .setName('reason')
              .setDescription('Reason for closing the ticket')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('claim')
          .setDescription('Claim a ticket to handle it (run in the ticket channel)')
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('unclaim')
          .setDescription('Unclaim a ticket (run in the ticket channel)')
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('add')
          .setDescription('Add a user to a ticket (run in the ticket channel)')
          .addUserOption(option => 
            option
              .setName('user')
              .setDescription('User to add to the ticket')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('remove')
          .setDescription('Remove a user from a ticket (run in the ticket channel)')
          .addUserOption(option => 
            option
              .setName('user')
              .setDescription('User to remove from the ticket')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('list')
          .setDescription('List active tickets')
          .addStringOption(option => 
            option
              .setName('status')
              .setDescription('Filter by status')
              .setRequired(false)
              .addChoices(
                { name: 'All', value: 'all' },
                { name: 'Open', value: 'Open' },
                { name: 'Closed', value: 'Closed' }
              )
          )
          .addStringOption(option => 
            option
              .setName('category')
              .setDescription('Filter by category')
              .setRequired(false)
              .addChoices(
                { name: 'All Categories', value: 'all' },
                { name: 'General Support', value: 'General Support' },
                { name: 'In-Game Reports', value: 'In-Game Reports' },
                { name: 'Staff Reports', value: 'Staff Reports' }
              )
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('transcript')
          .setDescription('Generate a transcript of the ticket (run in the ticket channel)')
      ),
    
    // Set permissions - Everyone can create tickets, but staff-only for management
    permissions: PERMISSION_PRESETS.MODERATOR_PLUS,
    
    // Specific permissions per subcommand
    subcommandPermissions: {
      'create': null, // Everyone can create tickets
      'close': PERMISSION_PRESETS.MODERATOR_PLUS,
      'claim': PERMISSION_PRESETS.MODERATOR_PLUS,
      'unclaim': PERMISSION_PRESETS.MODERATOR_PLUS,
      'add': PERMISSION_PRESETS.MODERATOR_PLUS,
      'remove': PERMISSION_PRESETS.MODERATOR_PLUS,
      'list': PERMISSION_PRESETS.MODERATOR_PLUS,
      'transcript': PERMISSION_PRESETS.MODERATOR_PLUS
    },
    
    async execute(interaction) {
      const interactionKey = `${interaction.id}-${interaction.user.id}`;
      const subcommand = interaction.options.getSubcommand();
      
      try {
        switch (subcommand) {
          case 'create':
            await handleCreateTicket(interaction, interactionKey);
            break;
          case 'close':
            await handleCloseTicket(interaction, interactionKey);
            break;
          case 'claim':
            await handleClaimTicket(interaction, interactionKey);
            break;
          case 'unclaim':
            await handleUnclaimTicket(interaction, interactionKey);
            break;
          case 'add':
            await handleAddUser(interaction, interactionKey);
            break;
          case 'remove':
            await handleRemoveUser(interaction, interactionKey);
            break;
          case 'list':
            await handleListTickets(interaction, interactionKey);
            break;
          case 'transcript':
            await handleGenerateTranscript(interaction, interactionKey);
            break;
          default:
            await safeReply(interaction, {
              content: 'Unknown subcommand.',
              ephemeral: true
            }, interactionKey);
        }
      } catch (error) {
        const errorId = ErrorHandler.handleInteractionError(error, interaction, `Ticket ${subcommand}`);
        
        await safeReply(interaction, {
          content: `An error occurred while processing the ticket command. Error ID: ${errorId}`,
          ephemeral: true
        }, interactionKey);
      }
    }
  };
  
  /**
   * Handle the creation of a ticket
   */
  async function handleCreateTicket(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: true }, interactionKey);
    
    try {
      // Get command options
      const category = interaction.options.getString('category');
      const subject = interaction.options.getString('subject');
      const description = interaction.options.getString('description');
      const priority = interaction.options.getString('priority') || 'Medium';
      
      // Check if user has reached the maximum number of active tickets
      const activeTickets = await Ticket.countDocuments({
        'creator.userId': interaction.user.id,
        status: 'Open'
      });
      
      const maxTickets = config.ticketSettings?.maxActivePerUser || 1;
      
      if (activeTickets >= maxTickets) {
        return await safeReply(interaction, {
          content: `You can only have ${maxTickets} active ticket(s) at a time. Please close your existing tickets before creating a new one.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Special handling for staff reports
      const isStaffReport = category === 'Staff Reports';
      let reportedStaffId = null;
      let reportedStaffRank = null;
      
      // Increment the ticket counter
      ticketCounter++;
      
      // Generate a unique ticket ID
      const ticketId = `TICKET-${ticketCounter}`;
      
      // Generate a channel name
      const channelName = `ticket-${ticketCounter}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      // Create the ticket channel
      const guild = interaction.guild;
      const ticketCategory = await guild.channels.fetch(channelIds.ticketCategory);
      
      if (!ticketCategory) {
        return await safeReply(interaction, {
          content: 'Ticket category channel not found. Please contact an administrator.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Set up permissions for the channel
      const permissionOverwrites = [
        // Default permissions (everyone can't see the channel)
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        // Creator can see the channel
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        // Bot can see and manage the channel
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages
          ]
        }
      ];
      
      // Add permissions for staff based on category
      if (category === 'General Support' || category === 'In-Game Reports') {
        // For general tickets, all moderators+ can see
        permissionOverwrites.push({
          id: roleIds.ModerationCategory,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        });
      } else if (category === 'Staff Reports') {
        // For staff reports, only internal affairs team and directors can see
        permissionOverwrites.push({
          id: roleIds.InternalAffairsCategory,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        }, {
          id: roleIds.DirectiveTeam,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        });
      }
      
      // Create the channel
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory,
        permissionOverwrites: permissionOverwrites,
        topic: `Support Ticket | ID: ${ticketId} | Creator: ${interaction.user.tag} (${interaction.user.id}) | Category: ${category}`
      });
      
      // Create the ticket in the database
      const ticketData = {
        ticketId,
        channelId: channel.id,
        creator: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        category,
        subject,
        priority,
        status: 'Open',
        participants: [{
          userId: interaction.user.id,
          username: interaction.user.username,
          addedBy: interaction.client.user.id,
          addedAt: new Date()
        }],
        lastActivity: new Date()
      };
      
      // Add staff report data if applicable
      if (isStaffReport) {
        ticketData.staffReport = {
          isStaffReport: true,
          reportedStaffId,
          reportedStaffRank,
          originallyVisibleTo: ['InternalAffairs', 'Directors']
        };
      }
      
      const ticket = new Ticket(ticketData);
      await ticket.save();
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Ticket_Created',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        details: {
          ticketId,
          channelId: channel.id,
          category,
          subject,
          priority
        },
        relatedIds: {
          ticketId: ticket._id
        }
      });
      
      await logEntry.save();
      
      // Send welcome message in the ticket channel
      const welcomeEmbed = new EmbedBuilder()
        .setColor(getTicketCategoryColor(category))
        .setTitle(`New Ticket: ${subject}`)
        .setDescription(`Thank you for creating a ticket. Our staff will assist you as soon as possible.`)
        .addFields(
          { name: 'Ticket ID', value: ticketId, inline: true },
          { name: 'Category', value: category, inline: true },
          { name: 'Priority', value: priority, inline: true },
          { name: 'Description', value: description }
        )
        .setFooter({ text: 'Please be patient while staff reviews your ticket.' })
        .setTimestamp();
      
      // Add buttons for ticket management
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:claim:${ticketId}`)
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`ticket:close:${ticketId}`)
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );
      
      await channel.send({ embeds: [welcomeEmbed], components: [actionRow] });
      
      // Also send the description as a separate message from the user
      await channel.send({
        content: `**Ticket Description from ${interaction.user}**:\n\n${description}`
      });
      
      // Notify the user that the ticket has been created
      await safeReply(interaction, {
        content: `Your ticket has been created successfully. Please proceed to ${channel} to continue.`,
        ephemeral: true
      }, interactionKey);
      
      // Ping staff for high priority tickets
      if (priority === 'High') {
        let roleToPing;
        if (category === 'Staff Reports') {
          roleToPing = roleIds.InternalAffairsCategory;
        } else {
          roleToPing = roleIds.ModerationCategory;
        }
        
        await channel.send({
          content: `<@&${roleToPing}> This is a **high priority** ticket that requires immediate attention.`
        });
      }
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Create Command');
      
      await safeReply(interaction, {
        content: `An error occurred while creating the ticket. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle closing a ticket
   */
  async function handleCloseTicket(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: false }, interactionKey);
    
    try {
      // Check if this is a ticket channel
      const ticketData = await Ticket.findOne({ channelId: interaction.channelId });
      
      if (!ticketData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in ticket channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the ticket is already closed
      if (ticketData.status === 'Closed') {
        return await safeReply(interaction, {
          content: 'This ticket is already closed.',
          ephemeral: true
        }, interactionKey);
      }
      
      const reason = interaction.options.getString('reason');
      
      // Update the ticket in the database
      ticketData.status = 'Closed';
      ticketData.closedBy = {
        userId: interaction.user.id,
        username: interaction.user.username,
        closedAt: new Date(),
        reason
      };
      
      await ticketData.save();
      
      // Generate transcript if enabled
      let transcriptUrl = null;
      if (config.ticketSettings?.transcriptGenerationEnabled) {
        try {
          transcriptUrl = await generateTranscript(interaction.channel, ticketData);
          
          // Update ticket with transcript URL
          ticketData.transcriptUrl = transcriptUrl;
          await ticketData.save();
        } catch (transcriptError) {
          logger.error(`Error generating transcript: ${transcriptError.message}`);
        }
      }
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Ticket_Closed',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: ticketData.creator.userId,
          username: ticketData.creator.username
        },
        details: {
          ticketId: ticketData.ticketId,
          channelId: interaction.channelId,
          reason,
          hasTranscript: !!transcriptUrl
        },
        relatedIds: {
          ticketId: ticketData._id
        }
      });
      
      await logEntry.save();
      
      // Send closure message
      const closureEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Ticket Closed')
        .setDescription(`This ticket has been closed by ${interaction.user.username}.`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        );
      
      if (transcriptUrl) {
        closureEmbed.addFields({ name: 'Transcript', value: 'A transcript has been saved automatically.' });
      }
      
      // If the ticket was claimed, add that to the embed
      if (ticketData.claimedBy && ticketData.claimedBy.userId) {
        closureEmbed.addFields({ name: 'Handled By', value: ticketData.claimedBy.username });
      }
      
      await interaction.channel.send({ embeds: [closureEmbed] });
      
      // Send confirmation
      await safeReply(interaction, {
        content: `Ticket ${ticketData.ticketId} has been closed. ${config.ticketSettings?.deleteClosedAfterHours ? `This channel will be deleted in ${config.ticketSettings.deleteClosedAfterHours} hour(s).` : ''}`
      }, interactionKey);
      
      // Schedule channel for deletion if configured
      if (config.ticketSettings?.deleteClosedAfterHours > 0) {
        const deleteMs = config.ticketSettings.deleteClosedAfterHours * 3600000; // Convert hours to milliseconds
        
        // Send a warning message about the upcoming deletion
        await interaction.channel.send({
          content: `⚠️ This channel will be automatically deleted in ${config.ticketSettings.deleteClosedAfterHours} hour(s).`
        });
        
        // For testing, we can use a shorter timeout
        /*
        setTimeout(async () => {
          try {
            await interaction.channel.delete(`Ticket auto-deleted after ${config.ticketSettings.deleteClosedAfterHours} hours of being closed`);
            logger.info(`Auto-deleted ticket channel for ${ticketData.ticketId}`);
          } catch (deleteError) {
            logger.error(`Failed to delete ticket channel: ${deleteError.message}`);
          }
        }, deleteMs);
        */
        
        // Note: In a real implementation, we would use a background task to handle this
        // rather than setTimeout, since timeouts don't persist if the bot restarts
      }
      
      // Try to notify the creator via DM
      try {
        const creator = await interaction.client.users.fetch(ticketData.creator.userId);
        
        if (creator) {
          const dmEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Your Ticket Has Been Closed')
            .setDescription(`Your ticket regarding "${ticketData.subject}" has been closed.`)
            .addFields(
              { name: 'Ticket ID', value: ticketData.ticketId, inline: true },
              { name: 'Category', value: ticketData.category, inline: true },
              { name: 'Closed By', value: interaction.user.username, inline: true },
              { name: 'Reason', value: reason }
            )
            .setTimestamp();
          
          if (transcriptUrl) {
            dmEmbed.addFields({ name: 'Transcript', value: 'A transcript of this ticket has been saved.' });
          }
          
          await creator.send({ embeds: [dmEmbed] }).catch(() => {
            // Silently fail if we can't DM the user
            logger.debug(`Could not send ticket closure DM to ${creator.tag}`);
          });
        }
      } catch (dmError) {
        logger.warn(`Failed to notify creator of ticket closure: ${dmError.message}`);
      }
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Close Command');
      
      await safeReply(interaction, {
        content: `An error occurred while closing the ticket. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle claiming a ticket
   */
  async function handleClaimTicket(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: false }, interactionKey);
    
    try {
      // Check if this is a ticket channel
      const ticketData = await Ticket.findOne({ channelId: interaction.channelId });
      
      if (!ticketData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in ticket channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the ticket is closed
      if (ticketData.status === 'Closed') {
        return await safeReply(interaction, {
          content: 'This ticket is closed and cannot be claimed.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the ticket is already claimed
      if (ticketData.claimedBy && ticketData.claimedBy.userId) {
        // If it's claimed by the current user, let them know
        if (ticketData.claimedBy.userId === interaction.user.id) {
          return await safeReply(interaction, {
            content: 'You have already claimed this ticket.',
            ephemeral: true
          }, interactionKey);
        }
        
        // Otherwise, let them know who claimed it
        return await safeReply(interaction, {
          content: `This ticket has already been claimed by ${ticketData.claimedBy.username}.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Update the ticket in the database
      ticketData.claimedBy = {
        userId: interaction.user.id,
        username: interaction.user.username,
        claimedAt: new Date()
      };
      
      // Update last activity
      ticketData.lastActivity = new Date();
      
      await ticketData.save();
      
      // Update staff statistics
      await User.findOneAndUpdate(
        { userId: interaction.user.id },
        { $inc: { 'staffStatistics.ticketsHandled': 1 } },
        { upsert: true }
      );
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Ticket_Claimed',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: ticketData.creator.userId,
          username: ticketData.creator.username
        },
        details: {
          ticketId: ticketData.ticketId,
          channelId: interaction.channelId
        },
        relatedIds: {
          ticketId: ticketData._id
        }
      });
      
      await logEntry.save();
      
      // Send claim message
      const claimEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Ticket Claimed')
        .setDescription(`This ticket has been claimed by ${interaction.user}.`)
        .addFields(
          { name: 'Staff Member', value: interaction.user.username },
          { name: 'Claimed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: 'The staff member will now assist you with your issue.' });
      
      await interaction.channel.send({ embeds: [claimEmbed] });
      
      // Send confirmation
      await safeReply(interaction, {
        content: `You have claimed ticket ${ticketData.ticketId}.`
      }, interactionKey);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Claim Command');
      
      await safeReply(interaction, {
        content: `An error occurred while claiming the ticket. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle unclaiming a ticket
   */
  async function handleUnclaimTicket(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: false }, interactionKey);
    
    try {
      // Check if this is a ticket channel
      const ticketData = await Ticket.findOne({ channelId: interaction.channelId });
      
      if (!ticketData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in ticket channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the ticket is closed
      if (ticketData.status === 'Closed') {
        return await safeReply(interaction, {
          content: 'This ticket is closed and cannot be modified.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the ticket is claimed
      if (!ticketData.claimedBy || !ticketData.claimedBy.userId) {
        return await safeReply(interaction, {
          content: 'This ticket is not currently claimed by anyone.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the ticket is claimed by someone else
      if (ticketData.claimedBy.userId !== interaction.user.id) {
        // Only administrators or higher can unclaim tickets claimed by others
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isAdmin = member.roles.cache.has(roleIds.AdministrationCategory) ||
                        member.roles.cache.has(roleIds.InternalAffairsCategory) ||
                        member.roles.cache.has(roleIds.DirectiveTeam);
        
        if (!isAdmin) {
          return await safeReply(interaction, {
            content: `This ticket is claimed by ${ticketData.claimedBy.username} and you don't have permission to unclaim it.`,
            ephemeral: true
          }, interactionKey);
        }
      }
      
      // Store the previous claimer for the log
      const previousClaimer = ticketData.claimedBy.username;
      
      // Update the ticket in the database
      ticketData.claimedBy = null;
      
      // Update last activity
      ticketData.lastActivity = new Date();
      
      await ticketData.save();
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Ticket_Unclaimed',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: ticketData.creator.userId,
          username: ticketData.creator.username
        },
        details: {
          ticketId: ticketData.ticketId,
          channelId: interaction.channelId,
          previousClaimer
        },
        relatedIds: {
          ticketId: ticketData._id
        }
      });
      
      await logEntry.save();
      
      // Send unclaim message
      const unclaimEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('Ticket Unclaimed')
        .setDescription(`This ticket has been unclaimed by ${interaction.user}.`)
        .addFields(
          { name: 'Previous Staff Member', value: previousClaimer },
          { name: 'Unclaimed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: 'Another staff member will claim this ticket soon.' });
      
      await interaction.channel.send({ embeds: [unclaimEmbed] });
    
    // Send confirmation
    await safeReply(interaction, {
      content: `You have unclaimed ticket ${ticketData.ticketId}.`
    }, interactionKey);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Unclaim Command');
    
    await safeReply(interaction, {
      content: `An error occurred while unclaiming the ticket. Error ID: ${errorId}`,
      ephemeral: true
    }, interactionKey);
  }
}

/**
 * Handle adding a user to a ticket
 */
async function handleAddUser(interaction, interactionKey) {
  await safeDefer(interaction, { ephemeral: true }, interactionKey);
  
  try {
    // Check if this is a ticket channel
    const ticketData = await Ticket.findOne({ channelId: interaction.channelId });
    
    if (!ticketData) {
      return await safeReply(interaction, {
        content: 'This command can only be used in ticket channels.',
        ephemeral: true
      }, interactionKey);
    }
    
    // Check if the ticket is closed
    if (ticketData.status === 'Closed') {
      return await safeReply(interaction, {
        content: 'This ticket is closed and users cannot be added.',
        ephemeral: true
      }, interactionKey);
    }
    
    const userToAdd = interaction.options.getUser('user');
    
    // Check if user is already in the ticket
    const isAlreadyParticipant = ticketData.participants.some(
      participant => participant.userId === userToAdd.id
    );
    
    if (isAlreadyParticipant) {
      return await safeReply(interaction, {
        content: `${userToAdd.username} is already a participant in this ticket.`,
        ephemeral: true
      }, interactionKey);
    }
    
    // Add user to ticket in the database
    ticketData.participants.push({
      userId: userToAdd.id,
      username: userToAdd.username,
      addedBy: interaction.user.id,
      addedAt: new Date()
    });
    
    // Update last activity
    ticketData.lastActivity = new Date();
    
    await ticketData.save();
    
    // Add user to the channel
    await interaction.channel.permissionOverwrites.create(userToAdd.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });
    
    // Create audit log entry
    const logEntry = new AuditLog({
      actionType: 'Ticket_UserAdded',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: userToAdd.id,
        username: userToAdd.username
      },
      details: {
        ticketId: ticketData.ticketId,
        channelId: interaction.channelId
      },
      relatedIds: {
        ticketId: ticketData._id
      }
    });
    
    await logEntry.save();
    
    // Send notification in the channel
    const addEmbed = new EmbedBuilder()
      .setColor(getTicketCategoryColor(ticketData.category))
      .setTitle('User Added')
      .setDescription(`${userToAdd} has been added to this ticket by ${interaction.user}.`)
      .setTimestamp();
    
    await interaction.channel.send({ embeds: [addEmbed] });
    
    // Send confirmation to the command user
    await safeReply(interaction, {
      content: `You have added ${userToAdd.username} to ticket ${ticketData.ticketId}.`,
      ephemeral: true
    }, interactionKey);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Add User Command');
    
    await safeReply(interaction, {
      content: `An error occurred while adding the user to the ticket. Error ID: ${errorId}`,
      ephemeral: true
    }, interactionKey);
  }
}

/**
 * Handle removing a user from a ticket
 */
async function handleRemoveUser(interaction, interactionKey) {
  await safeDefer(interaction, { ephemeral: true }, interactionKey);
  
  try {
    // Check if this is a ticket channel
    const ticketData = await Ticket.findOne({ channelId: interaction.channelId });
    
    if (!ticketData) {
      return await safeReply(interaction, {
        content: 'This command can only be used in ticket channels.',
        ephemeral: true
      }, interactionKey);
    }
    
    // Check if the ticket is closed
    if (ticketData.status === 'Closed') {
      return await safeReply(interaction, {
        content: 'This ticket is closed and users cannot be removed.',
        ephemeral: true
      }, interactionKey);
    }
    
    const userToRemove = interaction.options.getUser('user');
    
    // Check if trying to remove the creator
    if (userToRemove.id === ticketData.creator.userId) {
      return await safeReply(interaction, {
        content: `You cannot remove the ticket creator (${ticketData.creator.username}) from the ticket.`,
        ephemeral: true
      }, interactionKey);
    }
    
    // Check if user is in the ticket
    const participantIndex = ticketData.participants.findIndex(
      participant => participant.userId === userToRemove.id
    );
    
    if (participantIndex === -1) {
      return await safeReply(interaction, {
        content: `${userToRemove.username} is not a participant in this ticket.`,
        ephemeral: true
      }, interactionKey);
    }
    
    // Remove user from ticket in the database
    ticketData.participants.splice(participantIndex, 1);
    
    // Update last activity
    ticketData.lastActivity = new Date();
    
    await ticketData.save();
    
    // Remove user from the channel
    await interaction.channel.permissionOverwrites.delete(userToRemove.id);
    
    // Create audit log entry
    const logEntry = new AuditLog({
      actionType: 'Ticket_UserRemoved',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: userToRemove.id,
        username: userToRemove.username
      },
      details: {
        ticketId: ticketData.ticketId,
        channelId: interaction.channelId
      },
      relatedIds: {
        ticketId: ticketData._id
      }
    });
    
    await logEntry.save();
    
    // Send notification in the channel
    const removeEmbed = new EmbedBuilder()
      .setColor(getTicketCategoryColor(ticketData.category))
      .setTitle('User Removed')
      .setDescription(`${userToRemove.username} has been removed from this ticket by ${interaction.user.username}.`)
      .setTimestamp();
    
    await interaction.channel.send({ embeds: [removeEmbed] });
    
    // Send confirmation to the command user
    await safeReply(interaction, {
      content: `You have removed ${userToRemove.username} from ticket ${ticketData.ticketId}.`,
      ephemeral: true
    }, interactionKey);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Remove User Command');
    
    await safeReply(interaction, {
      content: `An error occurred while removing the user from the ticket. Error ID: ${errorId}`,
      ephemeral: true
    }, interactionKey);
  }
}

/**
 * Handle listing tickets
 */
async function handleListTickets(interaction, interactionKey) {
  await safeDefer(interaction, { ephemeral: true }, interactionKey);
  
  try {
    // Get filter options
    const status = interaction.options.getString('status') || 'Open';
    const category = interaction.options.getString('category') || 'all';
    
    // Build the query
    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (category !== 'all') {
      query.category = category;
    }
    
    // Fetch tickets from the database
    const tickets = await Ticket.find(query)
      .sort({ lastActivity: -1 })
      .limit(25);
    
    if (tickets.length === 0) {
      return await safeReply(interaction, {
        content: `No tickets found matching your filters. Status: ${status}, Category: ${category}`,
        ephemeral: true
      }, interactionKey);
    }
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Tickets List')
      .setDescription(`Showing ${tickets.length} ticket(s)${status !== 'all' ? ` with status: ${status}` : ''}${category !== 'all' ? `, category: ${category}` : ''}`)
      .setTimestamp();
    
    // Add tickets to the embed
    for (const ticket of tickets) {
      const fieldName = `${ticket.ticketId} [${ticket.status}]`;
      
      let fieldValue = `**Subject:** ${ticket.subject}`;
      fieldValue += `\n**Creator:** ${ticket.creator.username}`;
      fieldValue += `\n**Category:** ${ticket.category}`;
      fieldValue += `\n**Created at:** <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`;
      
      if (ticket.claimedBy && ticket.claimedBy.userId) {
        fieldValue += `\n**Claimed by:** ${ticket.claimedBy.username}`;
      }
      
      if (ticket.status === 'Open') {
        fieldValue += `\n**Channel:** <#${ticket.channelId}>`;
      }
      
      embed.addFields({ name: fieldName, value: fieldValue });
    }
    
    // Add footer with count
    embed.setFooter({ text: `Showing ${tickets.length} of ${await Ticket.countDocuments(query)} tickets.` });
    
    // Send the list
    await safeReply(interaction, {
      embeds: [embed],
      ephemeral: true
    }, interactionKey);
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket List Command');
    
    await safeReply(interaction, {
      content: `An error occurred while listing tickets. Error ID: ${errorId}`,
      ephemeral: true
    }, interactionKey);
  }
}

/**
 * Handle generating a transcript of a ticket
 */
async function handleGenerateTranscript(interaction, interactionKey) {
  await safeDefer(interaction, { ephemeral: false }, interactionKey);
  
  try {
    // Check if this is a ticket channel
    const ticketData = await Ticket.findOne({ channelId: interaction.channelId });
    
    if (!ticketData) {
      return await safeReply(interaction, {
        content: 'This command can only be used in ticket channels.',
        ephemeral: true
      }, interactionKey);
    }
    
    // Generate the transcript
    const transcriptUrl = await generateTranscript(interaction.channel, ticketData);
    
    // Update ticket with transcript URL
    ticketData.transcriptUrl = transcriptUrl;
    await ticketData.save();
    
    // Send confirmation
    await safeReply(interaction, {
      content: `Transcript for ticket ${ticketData.ticketId} has been generated successfully.`
    }, interactionKey);
    
    // Post transcript link in the channel
    const transcriptEmbed = new EmbedBuilder()
      .setColor(getTicketCategoryColor(ticketData.category))
      .setTitle('Transcript Generated')
      .setDescription(`A transcript of this ticket has been generated by ${interaction.user.username}.`)
      .addFields({ name: 'Note', value: 'The transcript will be available to authorized staff members.' })
      .setTimestamp();
    
    await interaction.channel.send({ embeds: [transcriptEmbed] });
  } catch (error) {
    const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Ticket Transcript Command');
    
    await safeReply(interaction, {
      content: `An error occurred while generating the transcript. Error ID: ${errorId}`,
      ephemeral: true
    }, interactionKey);
  }
}

/**
 * Get color based on ticket category
 */
function getTicketCategoryColor(category) {
  switch (category) {
    case 'General Support':
      return '#0099ff'; // Blue
    case 'In-Game Reports':
      return '#ff9900'; // Orange
    case 'Staff Reports':
      return '#ff0000'; // Red
    default:
      return '#00cc99'; // Teal
  }
}

// Button handlers for ticket buttons
module.exports.buttons = {
  async claim(interaction, args) {
    try {
      const ticketId = args[0];
      
      // Set options as if it came from the command
      interaction.options = {
        getSubcommand: () => 'claim'
      };
      
      // Call the same handler used by the command
      await handleClaimTicket(interaction, `${interaction.id}-${interaction.user.id}`);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Ticket Claim Button');
    }
  },
  
  async close(interaction, args) {
    try {
      const ticketId = args[0];
      
      // Create a modal to collect closing reason
      const modal = new ModalBuilder()
        .setCustomId(`ticket:closeModal:${ticketId}`)
        .setTitle('Close Ticket');
      
      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing the ticket')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Please provide a reason for closing this ticket...')
        .setMaxLength(1000);
      
      const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Ticket Close Button');
    }
  }
};

// Add this to the bottom of src/discord/commands/infraction/ticketCommand.js

// Button handlers for ticket buttons
module.exports.buttons = {
    async create(interaction, args) {
      try {
        const category = args[0];
        
        // Create a modal for ticket details
        const modal = new ModalBuilder()
          .setCustomId(`ticket:createModal:${category}`)
          .setTitle(`Create ${category} Ticket`);
        
        const subjectInput = new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('Subject')
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(100)
          .setPlaceholder('Brief summary of your issue')
          .setRequired(true);
        
        const descriptionInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(4000)
          .setPlaceholder('Please describe your issue in detail')
          .setRequired(true);
        
        const priorityInput = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority (Low, Medium, High)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(6)
          .setPlaceholder('Medium')
          .setRequired(false);
        
        const firstActionRow = new ActionRowBuilder().addComponents(subjectInput);
        const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(priorityInput);
        
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
        
        await interaction.showModal(modal);
      } catch (error) {
        logger.error(`Error showing ticket creation modal: ${error.message}`);
        await interaction.reply({
          content: 'An error occurred while creating the ticket modal.',
          ephemeral: true
        });
      }
    }
  };
  
  // Modal handlers for ticket creation
  module.exports.modals = {
    async createModal(interaction, args) {
      const interactionKey = `${interaction.id}-${interaction.user.id}`;
      await safeDefer(interaction, { ephemeral: true }, interactionKey);
      
      try {
        const category = args[0];
        const subject = interaction.fields.getTextInputValue('subject');
        const description = interaction.fields.getTextInputValue('description');
        
        // Get priority (default to Medium if invalid)
        let priority = interaction.fields.getTextInputValue('priority') || 'Medium';
        priority = priority.trim();
        
        // Validate priority
        if (!['Low', 'Medium', 'High'].includes(priority)) {
          if (priority.toLowerCase() === 'low' || priority.toLowerCase() === 'l') {
            priority = 'Low';
          } else if (priority.toLowerCase() === 'high' || priority.toLowerCase() === 'h') {
            priority = 'High';
          } else {
            priority = 'Medium';
          }
        }
        
        // Set options as if it came from the command
        interaction.options = {
          getSubcommand: () => 'create',
          getString: (name) => {
            if (name === 'category') return category;
            if (name === 'subject') return subject;
            if (name === 'description') return description;
            if (name === 'priority') return priority;
            return null;
          }
        };
        
        // Call the same handler used by the command
        await handleCreateTicket(interaction, interactionKey);
      } catch (error) {
        logger.error(`Error creating ticket from modal: ${error.message}`);
        await safeReply(interaction, {
          content: 'An error occurred while creating your ticket.',
          ephemeral: true
        }, interactionKey);
      }
    }
  };    

// Modal handlers for ticket inputs
module.exports.modals = {
  async closeModal(interaction, args) {
    try {
      const ticketId = args[0];
      const reason = interaction.fields.getTextInputValue('reason');
      
      // Set options as if it came from the command
      interaction.options = {
        getSubcommand: () => 'close',
        getString: (name) => {
          if (name === 'reason') return reason;
          return null;
        }
      };
      
      // Call the same handler used by the command
      await handleCloseTicket(interaction, `${interaction.id}-${interaction.user.id}`);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Ticket Close Modal');
    }
  }
};