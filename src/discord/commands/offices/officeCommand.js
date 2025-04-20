// src/discord/commands/offices/officeCommand.js
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
  const Office = require('../../../database/models/Office');
  const User = require('../../../database/models/User');
  const AuditLog = require('../../../database/models/AuditLog');
  const { roleIds, roleNames, roleGroups } = require('../../../config/roles');
  const { channelIds, channelConfig } = require('../../../config/channels');
  const config = require('../../../config/config');
  const { safeReply, safeDefer } = require('../../events/interactionCreate');
  const { generateTranscript } = require('../../utils/transcriptGenerator');
  
  // Counter to track office cases (will be initialized from DB)
  let officeCounter = 0;
  
  // Initialize office counter from DB
  async function initOfficeCounter() {
    try {
      const latestOffice = await Office.findOne({}).sort({ officeId: -1 }).limit(1);
      if (latestOffice) {
        // Extract the number from the office ID (format: CASE-1234)
        const match = latestOffice.officeId.match(/CASE-(\d+)/);
        if (match && match[1]) {
          officeCounter = parseInt(match[1], 10);
        }
      }
      logger.info(`Initialized office counter: ${officeCounter}`);
    } catch (error) {
      logger.error(`Failed to initialize office counter: ${error.message}`);
      // Start from 1000 as a safe default
      officeCounter = 1000;
    }
  }
  
  // Initialize the counter
  initOfficeCounter();
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('office')
      .setDescription('Manage Internal Affairs offices')
      .addSubcommand(subcommand => 
        subcommand
          .setName('create')
          .setDescription('Create a new Internal Affairs office')
          .addUserOption(option => 
            option
              .setName('target')
              .setDescription('The staff member for this office')
              .setRequired(true)
          )
          .addStringOption(option => 
            option
              .setName('reason')
              .setDescription('Reason for creating this office')
              .setRequired(true)
          )
          .addStringOption(option => 
            option
              .setName('evidence')
              .setDescription('Evidence links (separate multiple links with commas)')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('close')
          .setDescription('Close an Internal Affairs office (run in the office channel)')
          .addStringOption(option => 
            option
              .setName('outcome')
              .setDescription('Outcome of the office')
              .setRequired(true)
              .addChoices(
                { name: 'No Action Required', value: 'No Action Required' },
                { name: 'Warning Issued', value: 'Warning Issued' },
                { name: 'Infraction Created', value: 'Infraction Created' },
                { name: 'Case Dismissed', value: 'Case Dismissed' },
                { name: 'Referred to Higher Authority', value: 'Referred to Higher Authority' }
              )
          )
          .addStringOption(option => 
            option
              .setName('notes')
              .setDescription('Closing notes')
              .setRequired(true)
          )
          .addStringOption(option => 
            option
              .setName('retention')
              .setDescription('Channel retention policy')
              .setRequired(true)
              .addChoices(
                { name: 'Keep Channel', value: 'Keep' },
                { name: 'Delete After 24h', value: 'Delete After 24h' },
                { name: 'Delete Immediately', value: 'Delete Immediately' }
              )
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('add')
          .setDescription('Add a staff member to an office (run in the office channel)')
          .addUserOption(option => 
            option
              .setName('user')
              .setDescription('Staff member to add to the office')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('remove')
          .setDescription('Remove a staff member from an office (run in the office channel)')
          .addUserOption(option => 
            option
              .setName('user')
              .setDescription('Staff member to remove from the office')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('list')
          .setDescription('List all active Internal Affairs offices')
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
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName('transcript')
          .setDescription('Generate a transcript of the office (run in the office channel)')
      ),
    
    // Set permissions for each subcommand - Internal Affairs+ can use all commands
    permissions: PERMISSION_PRESETS.INTERNAL_AFFAIRS_PLUS,
    
    async execute(interaction) {
      const interactionKey = `${interaction.id}-${interaction.user.id}`;
      const subcommand = interaction.options.getSubcommand();
      
      try {
        switch (subcommand) {
          case 'create':
            await handleCreateOffice(interaction, interactionKey);
            break;
          case 'close':
            await handleCloseOffice(interaction, interactionKey);
            break;
          case 'add':
            await handleAddStaff(interaction, interactionKey);
            break;
          case 'remove':
            await handleRemoveStaff(interaction, interactionKey);
            break;
          case 'list':
            await handleListOffices(interaction, interactionKey);
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
        const errorId = ErrorHandler.handleInteractionError(error, interaction, `Office ${subcommand}`);
        
        await safeReply(interaction, {
          content: `An error occurred while processing the office command. Error ID: ${errorId}`,
          ephemeral: true
        }, interactionKey);
      }
    }
  };
  
  /**
   * Handle the creation of an Internal Affairs office
   */
  async function handleCreateOffice(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: true }, interactionKey);
    
    try {
      const target = interaction.options.getUser('target');
      const reason = interaction.options.getString('reason');
      const evidenceString = interaction.options.getString('evidence') || '';
      const evidenceLinks = evidenceString.split(',').map(link => link.trim()).filter(link => link.length > 0);
      
      // Verify the target is a staff member
      const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
      
      if (!targetMember) {
        return await safeReply(interaction, {
          content: 'Unable to find the target user in this server.',
          ephemeral: true
        }, interactionKey);
      }
      
      if (!targetMember.roles.cache.has(roleIds.NyrpStaffTeam)) {
        return await safeReply(interaction, {
          content: 'The target user is not a staff member.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Determine the target's rank
      let targetRank = "Unknown";
      for (const roleId of roleGroups.allRanks) {
        if (targetMember.roles.cache.has(roleId)) {
          targetRank = roleNames[roleId];
          break;
        }
      }
      
      // Determine the creator's rank
      let creatorRank = "Unknown";
      for (const roleId of roleGroups.allRanks) {
        if (interaction.member.roles.cache.has(roleId)) {
          creatorRank = roleNames[roleId];
          break;
        }
      }
      
      // Increment the office counter
      officeCounter++;
      
      // Generate a unique office ID
      const officeId = `CASE-${officeCounter}`;
      
      // Generate a channel name
      const channelName = config.officeSettings.nameFormat
        .replace('{targetUsername}', target.username.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
        .replace('{caseNumber}', officeCounter);
      
      // Create the office channel
      const guild = interaction.guild;
      const officeCategory = await guild.channels.fetch(channelIds.internalAffairsCategory);
      
      if (!officeCategory) {
        return await safeReply(interaction, {
          content: 'Internal Affairs category channel not found. Please contact an administrator.',
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
        // Target can see the channel
        {
          id: target.id, // Make sure target is a valid User object
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        // Creator can see the channel
        {
          id: interaction.user.id, // Make sure interaction.user is a valid User object
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

      // For role permissions, ensure the roles exist in cache
      const internalAffairsRole = guild.roles.cache.get(roleIds.InternalAffairsCategory);
      if (internalAffairsRole) {
        permissionOverwrites.push({
          id: internalAffairsRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        });
      } else {
        logger.warn(`Internal Affairs role (${roleIds.InternalAffairsCategory}) not found in cache`);
      }

      // Add Management role to permissions
      const managementRole = guild.roles.cache.get(roleIds.ManagementCategory);
      if (managementRole) {
        permissionOverwrites.push({
          id: managementRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        });
      } else {
        logger.warn(`Management role (${roleIds.ManagementCategory}) not found in cache`);
      }

      // Create the channel
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: officeCategory,
        permissionOverwrites: permissionOverwrites,
        topic: `Internal Affairs Office | Case: ${officeId} | Target: ${target.tag} (${target.id}) | Created by: ${interaction.user.tag}`
      });
      
      // Create the office in the database
      const officeData = {
        officeId,
        channelId: channel.id,
        targetUser: {
          userId: target.id,
          username: target.username,
          rank: targetRank
        },
        createdBy: {
          userId: interaction.user.id,
          username: interaction.user.username,
          rank: creatorRank
        },
        reason,
        evidence: evidenceLinks,
        participants: [
          {
            userId: target.id,
            username: target.username,
            rank: targetRank,
            addedBy: interaction.client.user.id,
            addedAt: new Date()
          },
          {
            userId: interaction.user.id,
            username: interaction.user.username,
            rank: creatorRank,
            addedBy: interaction.client.user.id,
            addedAt: new Date()
          }
        ],
        status: 'Open',
        lastActivity: new Date()
      };
      
      const office = new Office(officeData);
      await office.save();
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Office_Created',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: target.id,
          username: target.username
        },
        details: {
          officeId,
          channelId: channel.id,
          reason
        },
        relatedIds: {
          officeId: office._id
        }
      });
      
      await logEntry.save();
      
      // Update user statistics
      await User.findOneAndUpdate(
        { userId: interaction.user.id },
        { $inc: { 'staffStatistics.officesCreated': 1 } },
        { upsert: true }
      );
      
      // Send welcome message in the office channel
      const welcomeEmbed = new EmbedBuilder()
        .setColor('#800080') // Purple
        .setTitle('Internal Affairs Office')
        .setDescription(`This office has been created to discuss a matter with ${target}.`)
        .addFields(
          { name: 'Case ID', value: officeId, inline: true },
          { name: 'Target', value: target.username, inline: true },
          { name: 'Created By', value: interaction.user.username, inline: true },
          { name: 'Reason', value: reason }
        )
        .setFooter({ text: 'Please maintain professionalism in this channel.' })
        .setTimestamp();
      
      // Add evidence field if provided
      if (evidenceLinks.length > 0) {
        welcomeEmbed.addFields({ name: 'Evidence', value: evidenceLinks.join('\n') });
      }
      
      // Add buttons for office management
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`office:transcript:${officeId}`)
            .setLabel('Generate Transcript')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`office:close:${officeId}`)
            .setLabel('Close Office')
            .setStyle(ButtonStyle.Danger)
        );
      
      await channel.send({ embeds: [welcomeEmbed], components: [actionRow] });
      
      // Send introduction message
      const introEmbed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('Office Introduction')
        .setDescription(`Hello ${target}, this channel has been created to discuss a matter with you.\n\n${interaction.user} has created this office for the following reason: **${reason}**\n\nPlease be cooperative and professional during this process.`);
      
      await channel.send({ embeds: [introEmbed] });
      
      // If evidence was provided, show it
      if (evidenceLinks.length > 0) {
        const evidenceEmbed = new EmbedBuilder()
          .setColor('#800080')
          .setTitle('Evidence')
          .setDescription('The following evidence has been provided for this case:')
          .addFields({ name: 'Links', value: evidenceLinks.join('\n') });
        
        await channel.send({ embeds: [evidenceEmbed] });
      }
      
      // Notify the user that the office has been created
      await safeReply(interaction, {
        content: `Internal Affairs office created successfully. Please proceed to ${channel} to continue.`,
        ephemeral: true
      }, interactionKey);
      
      // Try to send a DM to the target
      try {
        await target.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#800080')
              .setTitle('Internal Affairs Office Created')
              .setDescription(`An Internal Affairs office has been created regarding your staff position in ${guild.name}.`)
              .addFields(
                { name: 'Created By', value: interaction.user.username, inline: true },
                { name: 'Reason', value: reason },
                { name: 'Channel', value: `Please check the ${channel.name} channel in the server.` }
              )
              .setFooter({ text: 'Please be professional and cooperative during this process.' })
              .setTimestamp()
          ]
        });
      } catch (dmError) {
        logger.warn(`Could not send DM to ${target.tag}: ${dmError.message}`);
        // Add a note in the channel that the user couldn't be DMed
        await channel.send({
          content: `⚠️ Note: Unable to send a direct message to ${target}. They may have DMs disabled.`
        });
      }
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Create Command');
      
      await safeReply(interaction, {
        content: `An error occurred while creating the office. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle closing an Internal Affairs office
   */
  async function handleCloseOffice(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: false }, interactionKey);
    
    try {
      // Check if this is an office channel
      const officeData = await Office.findOne({ channelId: interaction.channelId });
      
      if (!officeData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in Internal Affairs office channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the office is already closed
      if (officeData.status === 'Closed') {
        return await safeReply(interaction, {
          content: 'This office is already closed.',
          ephemeral: true
        }, interactionKey);
      }
      
      const outcome = interaction.options.getString('outcome');
      const notes = interaction.options.getString('notes');
      const retention = interaction.options.getString('retention');
      
      // Update the office in the database
      officeData.status = 'Closed';
      officeData.outcome = outcome;
      officeData.closedBy = {
        userId: interaction.user.id,
        username: interaction.user.username,
        rank: 'Unknown', // Would need to determine this
        closedAt: new Date(),
        notes
      };
      officeData.channelRetention = retention;
      
      // If retention is "Delete After 24h", calculate the deletion time
      if (retention === 'Delete After 24h') {
        officeData.scheduledDeletion = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      }
      
      await officeData.save();
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Office_Closed',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: officeData.targetUser.userId,
          username: officeData.targetUser.username
        },
        details: {
          officeId: officeData.officeId,
          channelId: interaction.channelId,
          outcome,
          notes,
          retention
        },
        relatedIds: {
          officeId: officeData._id
        }
      });
      
      await logEntry.save();
      
      // Generate transcript if auto-transcript is enabled
      let transcriptUrl = null;
      if (config.officeSettings.autoTranscriptOnClose) {
        try {
          transcriptUrl = await generateTranscript(interaction.channel, officeData);
          
          // Update office with transcript URL
          officeData.transcriptUrl = transcriptUrl;
          await officeData.save();
        } catch (transcriptError) {
          logger.error(`Error generating transcript: ${transcriptError.message}`);
        }
      }
      
      // Send closure message
      const closureEmbed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('Office Closed')
        .setDescription(`This Internal Affairs office has been closed by ${interaction.user.username}.`)
        .addFields(
          { name: 'Outcome', value: outcome },
          { name: 'Notes', value: notes },
          { name: 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
          { name: 'Channel Retention', value: retention }
        );
      
      if (transcriptUrl) {
        closureEmbed.addFields({ name: 'Transcript', value: 'A transcript has been saved automatically.' });
      }
      
      await interaction.channel.send({ embeds: [closureEmbed] });
      
      // If retention is "Delete Immediately", delete the channel
      if (retention === 'Delete Immediately') {
        // Send a message that the channel will be deleted
        await interaction.channel.send({
          content: '⚠️ This channel will be deleted in 10 seconds.'
        });
        
        // Wait 10 seconds before deleting
        setTimeout(async () => {
          try {
            await interaction.channel.delete('Office closed with immediate deletion');
          } catch (deleteError) {
            logger.error(`Error deleting channel: ${deleteError.message}`);
          }
        }, 10000);
        
        // Just acknowledge the command since the channel will be deleted
        return await safeReply(interaction, {
          content: `Office ${officeData.officeId} has been closed with outcome: ${outcome}. The channel will be deleted shortly.`
        }, interactionKey);
      }
      
      // Send confirmation
      await safeReply(interaction, {
        content: `Office ${officeData.officeId} has been closed with outcome: ${outcome}.`
      }, interactionKey);
      
      // Try to notify the target via DM
      try {
        const target = await interaction.client.users.fetch(officeData.targetUser.userId);
        
        if (target) {
          const dmEmbed = new EmbedBuilder()
            .setColor('#800080')
            .setTitle('Internal Affairs Office Closed')
            .setDescription(`The Internal Affairs office regarding you has been closed.`)
            .addFields(
              { name: 'Case ID', value: officeData.officeId, inline: true },
              { name: 'Outcome', value: outcome, inline: true },
              { name: 'Closed By', value: interaction.user.username, inline: true },
              { name: 'Notes', value: notes }
            )
            .setTimestamp();
          
          await target.send({ embeds: [dmEmbed] }).catch(() => {
            // Silently fail if we can't DM the user
            logger.debug(`Could not send office closure DM to ${target.tag}`);
          });
        }
      } catch (dmError) {
        logger.warn(`Failed to notify target of office closure: ${dmError.message}`);
      }
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Close Command');
      
      await safeReply(interaction, {
        content: `An error occurred while closing the office. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle adding a staff member to an office
   */
  async function handleAddStaff(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: true }, interactionKey);
    
    try {
      // Check if this is an office channel
      const officeData = await Office.findOne({ channelId: interaction.channelId });
      
      if (!officeData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in Internal Affairs office channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if the office is closed
      if (officeData.status === 'Closed') {
        return await safeReply(interaction, {
          content: 'This office is closed and staff members cannot be added.',
          ephemeral: true
        }, interactionKey);
      }
      
      const userToAdd = interaction.options.getUser('user');
      
      // Check if user is already in the office
      const isAlreadyParticipant = officeData.participants.some(
        participant => participant.userId === userToAdd.id
      );
      
      if (isAlreadyParticipant) {
        return await safeReply(interaction, {
          content: `${userToAdd.username} is already a participant in this office.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Verify the user is a staff member
      const member = await interaction.guild.members.fetch(userToAdd.id).catch(() => null);
      
      if (!member || !member.roles.cache.has(roleIds.NyrpStaffTeam)) {
        return await safeReply(interaction, {
          content: 'Only staff members can be added to Internal Affairs offices.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Determine the user's rank
      let userRank = "Unknown";
      for (const roleId of roleGroups.allRanks) {
        if (member.roles.cache.has(roleId)) {
          userRank = roleNames[roleId];
          break;
        }
      }
      
      // Add user to office in the database
      officeData.participants.push({
        userId: userToAdd.id,
        username: userToAdd.username,
        rank: userRank,
        addedBy: interaction.user.id,
        addedAt: new Date()
      });
      
      // Update last activity
      officeData.lastActivity = new Date();
      
      await officeData.save();
      
      // Add user to the channel
      await interaction.channel.permissionOverwrites.create(userToAdd.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
      });
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Office_UserAdded',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: userToAdd.id,
          username: userToAdd.username
        },
        details: {
          officeId: officeData.officeId,
          channelId: interaction.channelId
        },
        relatedIds: {
          officeId: officeData._id
        }
      });
      
      await logEntry.save();
      
      // Send notification in the channel
      const addEmbed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('Staff Member Added')
        .setDescription(`${userToAdd} has been added to this office by ${interaction.user}.`)
        .setTimestamp();
      
      await interaction.channel.send({ embeds: [addEmbed] });
      
      // Send confirmation to the command user
      await safeReply(interaction, {
        content: `You have added ${userToAdd.username} to office ${officeData.officeId}.`,
        ephemeral: true
      }, interactionKey);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Add Staff Command');
      
      await safeReply(interaction, {
        content: `An error occurred while adding the staff member to the office. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle removing a staff member from an office
   */
  async function handleRemoveStaff(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: true }, interactionKey);
    
    try {
      // Check if this is an office channel
      const officeData = await Office.findOne({ channelId: interaction.channelId });
      
      if (!officeData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in Internal Affairs office channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      const userToRemove = interaction.options.getUser('user');
      
      // Check if trying to remove the target
      if (userToRemove.id === officeData.targetUser.userId) {
        return await safeReply(interaction, {
          content: `You cannot remove the office target (${officeData.targetUser.username}) from the office.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if trying to remove the creator
      if (userToRemove.id === officeData.createdBy.userId) {
        return await safeReply(interaction, {
          content: `You cannot remove the office creator (${officeData.createdBy.username}) from the office.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if user is in the office
      const participantIndex = officeData.participants.findIndex(
        participant => participant.userId === userToRemove.id
      );
      
      if (participantIndex === -1) {
        return await safeReply(interaction, {
          content: `${userToRemove.username} is not a participant in this office.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Remove user from office in the database
      officeData.participants.splice(participantIndex, 1);
      
      // Update last activity
      officeData.lastActivity = new Date();
      
      await officeData.save();
      
      // Remove user from the channel
      await interaction.channel.permissionOverwrites.delete(userToRemove.id);
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Office_UserRemoved',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username
        },
        targetUser: {
          userId: userToRemove.id,
          username: userToRemove.username
        },
        details: {
          officeId: officeData.officeId,
          channelId: interaction.channelId
        },
        relatedIds: {
          officeId: officeData._id
        }
      });
      
      await logEntry.save();
      
      // Send notification in the channel
      const removeEmbed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('Staff Member Removed')
        .setDescription(`${userToRemove.username} has been removed from this office by ${interaction.user.username}.`)
        .setTimestamp();
      
      await interaction.channel.send({ embeds: [removeEmbed] });
      
      // Send confirmation to the command user
      await safeReply(interaction, {
        content: `You have removed ${userToRemove.username} from office ${officeData.officeId}.`,
        ephemeral: true
      }, interactionKey);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Remove Staff Command');
      
      await safeReply(interaction, {
        content: `An error occurred while removing the staff member from the office. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle listing Internal Affairs offices
   */
  async function handleListOffices(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: true }, interactionKey);
    
    try {
      // Get filter options
      const status = interaction.options.getString('status') || 'all';
      
      // Build the query
      const query = {};
      
      if (status !== 'all') {
        query.status = status;
      }
      
      // Fetch offices from the database
      const offices = await Office.find(query)
        .sort({ lastActivity: -1 })
        .limit(25);
      
      if (offices.length === 0) {
        return await safeReply(interaction, {
          content: 'No offices found matching the specified filters.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Create the embed
      const embed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('Internal Affairs Office List')
        .setDescription(`Showing ${offices.length} office(s)${status !== 'all' ? ` with status: ${status}` : ''}`)
        .setTimestamp();
      
      // Add offices to the embed
      for (const office of offices) {
        const fieldName = `${office.officeId} [${office.status}]`;
        
        let fieldValue = `**Target:** ${office.targetUser.username}`;
        
        if (office.targetUser.rank) {
          fieldValue += ` (${office.targetUser.rank})`;
        }
        
        fieldValue += `\n**Created by:** ${office.createdBy.username}`;
        fieldValue += `\n**Created at:** <t:${Math.floor(new Date(office.createdAt).getTime() / 1000)}:F>`;
        
        if (office.outcome) {
          fieldValue += `\n**Outcome:** ${office.outcome}`;
        }
        
        if (office.status === 'Open') {
          fieldValue += `\n**Channel:** <#${office.channelId}>`;
        }
        
        embed.addFields({ name: fieldName, value: fieldValue });
      }
      
      // Add footer with count
      embed.setFooter({ text: `Showing ${offices.length} of ${await Office.countDocuments(query)} offices.` });
      
      // Send the list
      await safeReply(interaction, {
        embeds: [embed],
        ephemeral: true
      }, interactionKey);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office List Command');
      
      await safeReply(interaction, {
        content: `An error occurred while listing offices. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
  
  /**
   * Handle generating a transcript of an office
   */
  async function handleGenerateTranscript(interaction, interactionKey) {
    await safeDefer(interaction, { ephemeral: false }, interactionKey);
    
    try {
      // Check if this is an office channel
      const officeData = await Office.findOne({ channelId: interaction.channelId });
      
      if (!officeData) {
        return await safeReply(interaction, {
          content: 'This command can only be used in Internal Affairs office channels.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Generate the transcript
      const transcriptUrl = await generateTranscript(interaction.channel, officeData);
      
      // Update office with transcript URL
      officeData.transcriptUrl = transcriptUrl;
      await officeData.save();
      
      // Send confirmation
      await safeReply(interaction, {
        content: `Transcript for office ${officeData.officeId} has been generated successfully.`
      }, interactionKey);
      
      // Post transcript link in the channel
      const transcriptEmbed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('Transcript Generated')
        .setDescription(`A transcript of this office has been generated by ${interaction.user.username}.`)
        .addFields({ name: 'Note', value: 'The transcript will be available to authorized staff members.' })
        .setTimestamp();
      
      await interaction.channel.send({ embeds: [transcriptEmbed] });
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Transcript Command');
      
      await safeReply(interaction, {
        content: `An error occurred while generating the transcript. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  
    // Button handlers for office actions
    { module.exports.buttons = {
     async close(interaction, args) {
      try {
      const officeId = args[0];
      
      // Create a modal to collect closure information
      const modal = new ModalBuilder()
        .setCustomId(`office:closeModal:${officeId}`)
        .setTitle('Close Office');
      
      const outcomeInput = new TextInputBuilder()
        .setCustomId('outcome')
        .setLabel('Outcome')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Select an outcome')
        .setValue('No Action Required'); // Default value
      
      const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Closing Notes')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Enter notes about the closure...')
        .setMaxLength(1000);
      
      const retentionInput = new TextInputBuilder()
        .setCustomId('retention')
        .setLabel('Channel Retention (Keep/Delete After 24h/Delete Immediately)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Keep')
        .setValue('Keep');
      
      const firstActionRow = new ActionRowBuilder().addComponents(outcomeInput);
      const secondActionRow = new ActionRowBuilder().addComponents(notesInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(retentionInput);
      
      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
      
      await interaction.showModal(modal);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Close Button');
      logger.error(`Error showing office close modal: ${error.message} (Error ID: ${errorId})`);
    }
  },
  
  async transcript(interaction, args) {
    try {
      const officeId = args[0];
      const interactionKey = `${interaction.id}-${interaction.user.id}`;
      
      // Set options as if it came from the command
      interaction.options = {
        getSubcommand: () => 'transcript'
      };
      
      // Call the same handler used by the command
      await handleGenerateTranscript(interaction, interactionKey);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Transcript Button');
      logger.error(`Error generating transcript: ${error.message} (Error ID: ${errorId})`);
    }
  }
};

// Modal handlers for office closure
module.exports.modals = {
  async closeModal(interaction, args) {
    try {
      const officeId = args[0];
      const outcome = interaction.fields.getTextInputValue('outcome');
      const notes = interaction.fields.getTextInputValue('notes');
      const retention = interaction.fields.getTextInputValue('retention');
      
      // Validate retention option
      let validRetention = 'Keep';
      if (['Keep', 'Delete After 24h', 'Delete Immediately'].includes(retention)) {
        validRetention = retention;
      }
      
      // Validate outcome option
      const validOutcomes = [
        'No Action Required',
        'Warning Issued',
        'Infraction Created',
        'Case Dismissed',
        'Referred to Higher Authority'
      ];
      
      let validOutcome = 'No Action Required';
      if (validOutcomes.includes(outcome)) {
        validOutcome = outcome;
      }
      
      // Set options as if it came from the command
      interaction.options = {
        getSubcommand: () => 'close',
        getString: (name) => {
          if (name === 'outcome') return validOutcome;
          if (name === 'notes') return notes;
          if (name === 'retention') return validRetention;
          return null;
        }
      };
      
      // Call the same handler used by the command
      const interactionKey = `${interaction.id}-${interaction.user.id}`;
      await handleCloseOffice(interaction, interactionKey);
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Office Close Modal');
      logger.error(`Error closing office: ${error.message} (Error ID: ${errorId})`);
    }
  }
}}
}