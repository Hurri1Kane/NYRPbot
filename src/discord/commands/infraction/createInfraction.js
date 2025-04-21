// src/discord/commands/infraction/createInfraction.js
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js'); 

const { PERMISSION_PRESETS } = require('../../utils/permissionManager');
const ErrorHandler = require('../../../utils/errorHandler');
const logger = require('../../../utils/logger');
const Infraction = require('../../../database/models/Infraction');
const User = require('../../../database/models/User');
const AuditLog = require('../../../database/models/AuditLog');
const { roleIds, roleNames } = require('../../../config/roles');
const { channelIds } = require('../../../config/channels');
const config = require('../../../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('infraction')
    .setDescription('Manage staff infractions')
    .addSubcommand(subcommand => 
      subcommand
        .setName('create')
        .setDescription('Create a new infraction against a staff member')
        .addUserOption(option => 
          option
            .setName('target')
            .setDescription('The staff member receiving the infraction')
            .setRequired(true)
        )
        .addStringOption(option => 
          option
            .setName('type')
            .setDescription('Type of infraction to issue')
            .setRequired(true)
            .addChoices(
              { name: 'Warning', value: 'Warning' },
              { name: 'Suspension', value: 'Suspension' },
              { name: 'Demotion', value: 'Demotion' },
              { name: 'Termination', value: 'Termination' },
              { name: 'Blacklist', value: 'Blacklist' },
              { name: 'Under Investigation', value: 'Under Investigation' }
            )
        )
        .addStringOption(option => 
          option
            .setName('reason')
            .setDescription('Reason for the infraction')
            .setRequired(true)
        )
        .addStringOption(option => 
          option
            .setName('evidence')
            .setDescription('Evidence links (separate multiple links with commas)')
            .setRequired(false)
        )
        .addBooleanOption(option => 
          option
            .setName('appealable')
            .setDescription('Whether this infraction can be appealed')
            .setRequired(false)
        )
        .addStringOption(option => 
          option
            .setName('duration')
            .setDescription('Duration for suspensions')
            .setRequired(false)
            .addChoices(
              { name: '24 Hours', value: '24h' },
              { name: '48 Hours', value: '48h' },
              { name: '72 Hours', value: '72h' },
              { name: '1 Week', value: '1w' },
              { name: '2 Weeks', value: '2w' }
            )
        )
    )
    .addSubcommand(subcommand => 
      subcommand
        .setName('approve')
        .setDescription('Approve a pending infraction')
        .addStringOption(option => 
          option
            .setName('infraction_id')
            .setDescription('ID of the infraction to approve')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option => 
          option
            .setName('notes')
            .setDescription('Any notes about the approval')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand => 
      subcommand
        .setName('deny')
        .setDescription('Deny a pending infraction')
        .addStringOption(option => 
          option
            .setName('infraction_id')
            .setDescription('ID of the infraction to deny')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option => 
          option
            .setName('reason')
            .setDescription('Reason for denying the infraction')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand => 
      subcommand
        .setName('view')
        .setDescription('View infraction details')
        .addStringOption(option => 
          option
            .setName('infraction_id')
            .setDescription('ID of the infraction to view')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand => 
      subcommand
        .setName('list')
        .setDescription('List infractions')
        .addUserOption(option => 
          option
            .setName('user')
            .setDescription('View infractions for a specific user')
            .setRequired(false)
        )
        .addStringOption(option => 
          option
            .setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
              { name: 'All', value: 'all' },
              { name: 'Pending', value: 'Pending' },
              { name: 'Approved', value: 'Approved' },
              { name: 'Denied', value: 'Denied' },
              { name: 'Completed', value: 'Completed' },
              { name: 'Expired', value: 'Expired' },
              { name: 'Appealed', value: 'Appealed' }
            )
        )
        .addIntegerOption(option => 
          option
            .setName('limit')
            .setDescription('Number of infractions to show (default: 10)')
            .setRequired(false)
        )
    ),
  
  // Set permissions - Internal Affairs members and above can create infractions
  permissions: PERMISSION_PRESETS.INTERNAL_AFFAIRS_PLUS,
  
  // Custom permissions for each subcommand
  subcommandPermissions: {
    'approve': PERMISSION_PRESETS.DIRECTOR_PLUS,
    'deny': PERMISSION_PRESETS.DIRECTOR_PLUS,
    'view': PERMISSION_PRESETS.INTERNAL_AFFAIRS_PLUS,
    'list': PERMISSION_PRESETS.INTERNAL_AFFAIRS_PLUS
  },
  
  // Autocomplete handler for infraction IDs
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'infraction_id') {
        let query = {};
        
        // For approve/deny, only show pending infractions
        if (interaction.options.getSubcommand() === 'approve' || interaction.options.getSubcommand() === 'deny') {
          query.status = 'Pending';
        }
        
        const infractions = await Infraction.find(query)
          .sort({ createdAt: -1 })
          .limit(25)
          .lean();
        
        const choices = infractions.map(inf => ({
          name: `${inf._id} - ${inf.type} for ${inf.targetUsername} (${inf.status})`,
          value: inf._id.toString()
        }));
        
        await interaction.respond(choices);
      }
    } catch (error) {
      logger.error(`Error in infraction autocomplete: ${error.message}`);
      // For autocomplete, we can only log the error, not respond to the interaction
    }
  },
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'create':
          await handleCreate(interaction);
          break;
        case 'approve':
          await handleApprove(interaction);
          break;
        case 'deny':
          await handleDeny(interaction);
          break;
        case 'view':
          await handleView(interaction);
          break;
        case 'list':
          await handleList(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, `Infraction ${subcommand}`);
    }
  }
};

/**
 * Handle the creation of a new infraction
 */
async function handleCreate(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Get all options from the command
    const target = interaction.options.getUser('target');
    const type = interaction.options.getString('type');
    const reason = interaction.options.getString('reason');
    const evidenceString = interaction.options.getString('evidence') || '';
    const evidenceLinks = evidenceString.split(',').map(link => link.trim()).filter(link => link.length > 0);
    const duration = interaction.options.getString('duration');
    
    // Default appealable based on infraction type
    let appealable = interaction.options.getBoolean('appealable');
    if (appealable === null) {
      // Set defaults based on type
      appealable = ['Warning', 'Under Investigation'].includes(type);
    }
    
    // Validate the options based on infraction type
    if (type === 'Suspension' && !duration) {
      return await interaction.editReply({
        content: 'Duration is required for suspensions.',
        ephemeral: true
      });
    }
    
    // Check if the target is a staff member
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    
    if (!targetMember) {
      return await interaction.editReply({
        content: 'Unable to find the target user in this server.',
        ephemeral: true
      });
    }
    
    if (!targetMember.roles.cache.has(roleIds.NyrpStaffTeam)) {
      return await interaction.editReply({
        content: 'The target user is not a staff member.',
        ephemeral: true
      });
    }
    
    // Check if user already has the status roles
    if (type === 'Under Investigation' && targetMember.roles.cache.has(roleIds.UnderInvestigation)) {
      return await interaction.editReply({
        content: 'This user is already under investigation.',
        ephemeral: true
      });
    }
    
    if (type === 'Blacklist' && targetMember.roles.cache.has(roleIds.Blacklisted)) {
      return await interaction.editReply({
        content: 'This user is already blacklisted.',
        ephemeral: true
      });
    }
    
    if (type === 'Suspension' && targetMember.roles.cache.has(roleIds.Suspended)) {
      return await interaction.editReply({
        content: 'This user is already suspended.',
        ephemeral: true
      });
    }
    
    // For suspensions, calculate expiration time
    let suspensionData = null;
    if (type === 'Suspension' && duration) {
      const durationMs = config.infractionSettings.suspensionDurations[duration];
      const expiresAt = new Date(Date.now() + durationMs);
      
      suspensionData = {
        duration,
        startedAt: new Date(),
        expiresAt
      };
    }
    
    // Create the infraction in the database
    const infraction = new Infraction({
      targetUserId: target.id,
      targetUsername: `${target.username}`,
      issuerUserId: interaction.user.id,
      issuerUsername: `${interaction.user.username}`,
      type,
      reason,
      evidence: evidenceLinks,
      status: 'Pending',
      appealable,
      suspensionData
    });
    
    await infraction.save();
    
    // Create a log entry
    const logEntry = new AuditLog({
      actionType: 'Infraction_Created',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: target.id,
        username: target.username
      },
      details: {
        infractionType: type,
        reason,
        appealable,
        evidence: evidenceLinks,
        status: 'Pending'
      },
      relatedIds: {
        infractionId: infraction._id
      }
    });
    
    await logEntry.save();
    
    // Send confirmation to the user
    await interaction.editReply({
      content: `Infraction created successfully and is pending approval. Infraction ID: ${infraction._id}`,
      ephemeral: true
    });
    
    // Send notification to the approval channel
    const approvalChannel = await interaction.guild.channels.fetch(channelIds.infractionApproval);
    
    if (approvalChannel) {
      const approvalEmbed = new EmbedBuilder()
        .setColor('#FFA500') // Orange for pending
        .setTitle(`Pending ${type} Infraction`)
        .setDescription(`A new infraction requires approval.`)
        .addFields(
          { name: 'Infraction ID', value: infraction._id.toString(), inline: true },
          { name: 'Type', value: type, inline: true },
          { name: 'Appealable', value: appealable ? 'Yes' : 'No', inline: true },
          { name: 'Target', value: `<@${target.id}> (${target.username})`, inline: false },
          { name: 'Issuer', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();
      
      if (evidenceLinks.length > 0) {
        approvalEmbed.addFields({ name: 'Evidence', value: evidenceLinks.join('\n'), inline: false });
      }
      
      if (suspensionData) {
        approvalEmbed.addFields({ 
          name: 'Duration', 
          value: duration, 
          inline: true 
        });
        
        approvalEmbed.addFields({ 
          name: 'Expires', 
          value: `<t:${Math.floor(suspensionData.expiresAt.getTime() / 1000)}:F>`, 
          inline: true 
        });
      }
      
      // Create buttons for approval/denial
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`infraction:approve:${infraction._id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`infraction:deny:${infraction._id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );
      
      await approvalChannel.send({
        embeds: [approvalEmbed],
        components: [actionRow]
      });
    }
  } catch (error) {
    logger.error(`Error creating infraction: ${error.message}`);
    await interaction.editReply({
      content: 'An error occurred while creating the infraction.',
      ephemeral: true
    });
    throw error;
  }
}

/**
 * Handle approving an infraction
 */
async function handleApprove(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const infractionId = interaction.options.getString('infraction_id');
    const notes = interaction.options.getString('notes') || '';
    
    // Find the infraction
    const infraction = await Infraction.findById(infractionId);

    // Log the infraction details for debugging
    logger.info(`Infraction evidence: ${JSON.stringify(infraction.evidence)}`);
    
    if (!infraction) {
      return await interaction.editReply({
        content: `Infraction with ID ${infractionId} not found.`,
        ephemeral: true
      });
    }
    
    // Check if the infraction is already approved or denied
    if (infraction.status !== 'Pending') {
      return await interaction.editReply({
        content: `This infraction has already been ${infraction.status.toLowerCase()}.`,
        ephemeral: true
      });
    }
    
    // Update the infraction status
    infraction.status = 'Approved';
    infraction.approvalData = {
      approvedBy: interaction.user.id,
      approvedByUsername: interaction.user.username,
      approvedAt: new Date(),
      notes
    };
    
    await infraction.save();
    
    // Create a log entry
    const logEntry = new AuditLog({
      actionType: 'Infraction_Approved',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: infraction.targetUserId,
        username: infraction.targetUsername
      },
      details: {
        infractionType: infraction.type,
        notes
      },
      relatedIds: {
        infractionId: infraction._id
      }
    });
    
    await logEntry.save();
    
    // Execute the infraction based on its type
    const targetMember = await interaction.guild.members.fetch(infraction.targetUserId).catch(() => null);
    
    if (!targetMember) {
      await interaction.editReply({
        content: `Infraction approved, but the target user is no longer in the server.`,
        ephemeral: true
      });
      return;
    }
    
    // Handle the infraction execution based on type
    switch (infraction.type) {
      case 'Warning':
        // Just update the status, no role changes needed
        break;
        
      case 'Under Investigation':
        // Add the Under Investigation role
        await targetMember.roles.add(roleIds.UnderInvestigation);
        break;
        
      case 'Suspension':
        // Record current roles, add Suspended role, remove all staff roles
        await executeSuspension(interaction, targetMember, infraction);
        break;
        
      case 'Demotion':
        // Handle demotion logic
        await executeDemotion(interaction, targetMember, infraction);
        break;

      case 'Termination':
        // Handle termination logic
        await executeTermination(interaction, targetMember, infraction);
        break;
        
      case 'Blacklist':
        // Remove all staff roles, add Blacklisted role
        await executeBlacklist(interaction, targetMember, infraction);
        break;
    }
    
    // Send a DM to the target user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`${infraction.type} Received`)
        .setDescription(`You have received a ${infraction.type.toLowerCase()} from the staff team.`)
        .addFields(
          { name: 'Reason', value: infraction.reason },
          { name: 'Appealable', value: infraction.appealable ? 'Yes' : 'No' }
        )
        .setTimestamp();
      
      // Add evidence to DM if available - make sure we're checking correctly
      if (infraction.evidence && infraction.evidence.length > 0) {
        dmEmbed.addFields({ 
          name: 'Evidence', 
          value: infraction.evidence.join('\n') 
        });
        
        // Let's also log it to confirm evidence is present
        logger.debug(`Sending evidence in DM: ${JSON.stringify(infraction.evidence)}`);
      }
      
      await targetMember.send({
        embeds: [dmEmbed]
      });
    } catch (dmError) {
      logger.warn(`Could not send DM to ${targetMember.user.tag}: ${dmError.message}`);
    }
    
    // Respond to the interaction
    await interaction.editReply({
      content: `Infraction ${infractionId} has been approved and executed.`,
      ephemeral: true
    });
    
    // Update the approval message if possible
    try {
      const approvalChannel = await interaction.guild.channels.fetch(channelIds.infractionApproval);
      const messages = await approvalChannel.messages.fetch({ limit: 100 });
      
      for (const message of messages.values()) {
        if (message.embeds.length > 0 && 
            message.embeds[0].fields.some(field => 
              field.name === 'Infraction ID' && field.value === infractionId
            )) {
          // Update the embed
          const originalEmbed = message.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setColor('#00FF00') // Green for approved
            .setTitle(`Approved ${infraction.type} Infraction`)
            .addFields({ name: 'Approved By', value: interaction.user.username, inline: true })
            .addFields({ name: 'Approved At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
          
          if (notes) {
            updatedEmbed.addFields({ name: 'Approval Notes', value: notes });
          }
          
          // Remove any action buttons
          await message.edit({
            embeds: [updatedEmbed],
            components: []
          });
          
          break;
        }
      }
    } catch (error) {
      logger.warn(`Could not update approval message: ${error.message}`);
    }
    
    // Announce the infraction in the announcement channel
    try {
      const announcementChannel = await interaction.guild.channels.fetch('1357029740376101088');
      
      if (announcementChannel) {
        const announcementEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle(`Staff ${infraction.type}`)
          .setDescription(`A staff member has received a ${infraction.type.toLowerCase()}.`)
          .addFields(
            { name: 'Staff Member', value: `<@${infraction.targetUserId}> (${infraction.targetUsername})`, inline: false },
            { name: 'Type', value: infraction.type, inline: true },
            { name: 'Reason', value: infraction.reason, inline: false },
            { name: 'Issued By', value: `<@${infraction.issuerUserId}> (${infraction.issuerUsername})`, inline: true },
            { name: 'Approved By', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true }
          )
          .setTimestamp();

          // Add evidence to announcement if available
        if (infraction.evidence && infraction.evidence.length > 0) {
          announcementEmbed.addFields({ 
            name: 'Evidence', 
            value: infraction.evidence.join('\n') 
          });
        }
        
        if (infraction.type === 'Suspension' && infraction.suspensionData) {
          announcementEmbed.addFields({ 
            name: 'Duration', 
            value: infraction.suspensionData.duration, 
            inline: true 
          });
          
          announcementEmbed.addFields({ 
            name: 'Expires', 
            value: `<t:${Math.floor(infraction.suspensionData.expiresAt.getTime() / 1000)}:F>`, 
            inline: true 
          });
        }
        
        await announcementChannel.send({ embeds: [announcementEmbed] });
      }
    } catch (error) {
      logger.warn(`Could not send announcement: ${error.message}`);
    }
  } catch (error) {
    logger.error(`Error approving infraction: ${error.message}`);
    await interaction.editReply({
      content: 'An error occurred while approving the infraction.',
      ephemeral: true
    });
    throw error;
  }
}

/**
 * Handle denying an infraction
 */
async function handleDeny(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const infractionId = interaction.options.getString('infraction_id');
    const reason = interaction.options.getString('reason');
    
    // Find the infraction
    const infraction = await Infraction.findById(infractionId);
    
    if (!infraction) {
      return await interaction.editReply({
        content: `Infraction with ID ${infractionId} not found.`,
        ephemeral: true
      });
    }
    
    // Check if the infraction is already approved or denied
    if (infraction.status !== 'Pending') {
      return await interaction.editReply({
        content: `This infraction has already been ${infraction.status.toLowerCase()}.`,
        ephemeral: true
      });
    }
    
    // Update the infraction status
    infraction.status = 'Denied';
    infraction.denialData = {
      deniedBy: interaction.user.id,
      deniedByUsername: interaction.user.username,
      deniedAt: new Date(),
      reason
    };
    
    await infraction.save();
    
    // Create a log entry
    const logEntry = new AuditLog({
      actionType: 'Infraction_Denied',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: infraction.targetUserId,
        username: infraction.targetUsername
      },
      details: {
        infractionType: infraction.type,
        denialReason: reason
      },
      relatedIds: {
        infractionId: infraction._id
      }
    });
    
    await logEntry.save();
    
    // Respond to the interaction
    await interaction.editReply({
      content: `Infraction ${infractionId} has been denied.`,
      ephemeral: true
    });
    
    // Update the approval message if possible
    try {
      const approvalChannel = await interaction.guild.channels.fetch(channelIds.infractionApproval);
      const messages = await approvalChannel.messages.fetch({ limit: 100 });
      
      for (const message of messages.values()) {
        if (message.embeds.length > 0 && 
            message.embeds[0].fields.some(field => 
              field.name === 'Infraction ID' && field.value === infractionId
            )) {
          // Update the embed
          const originalEmbed = message.embeds[0];
          const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setColor('#808080') // Gray for denied
            .setTitle(`Denied ${infraction.type} Infraction`)
            .addFields({ name: 'Denied By', value: interaction.user.username, inline: true })
            .addFields({ name: 'Denied At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true })
            .addFields({ name: 'Denial Reason', value: reason });
          
          // Remove any action buttons
          await message.edit({
            embeds: [updatedEmbed],
            components: []
          });
          
          break;
        }
      }
    } catch (error) {
      logger.warn(`Could not update approval message: ${error.message}`);
    }
    
    // Notify the issuer
    try {
      const issuer = await interaction.guild.members.fetch(infraction.issuerUserId);
      await issuer.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#808080')
            .setTitle(`Infraction Denied`)
            .setDescription(`Your ${infraction.type.toLowerCase()} infraction against ${infraction.targetUsername} has been denied.`)
            .addFields(
              { name: 'Reason for Denial', value: reason },
              { name: 'Denied By', value: interaction.user.username }
            )
            .setTimestamp()
        ]
      });
    } catch (dmError) {
      logger.warn(`Could not send DM to issuer: ${dmError.message}`);
    }
  } catch (error) {
    logger.error(`Error denying infraction: ${error.message}`);
    await interaction.editReply({
      content: 'An error occurred while denying the infraction.',
      ephemeral: true
    });
    throw error;
  }
}

/**
 * Handle viewing an infraction
 */
async function handleView(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const infractionId = interaction.options.getString('infraction_id');
    
    // Find the infraction
    const infraction = await Infraction.findById(infractionId);
    
    if (!infraction) {
      return await interaction.editReply({
        content: `Infraction with ID ${infractionId} not found.`,
        ephemeral: true
      });
    }
    
    // Create an embed with all the infraction details
    const embed = new EmbedBuilder()
      .setTitle(`Infraction Details: ${infraction.type}`)
      .setDescription(`Full details for infraction ${infraction._id}`)
      .addFields(
        { name: 'Status', value: infraction.status, inline: true },
        { name: 'Type', value: infraction.type, inline: true },
        { name: 'Appealable', value: infraction.appealable ? 'Yes' : 'No', inline: true },
        { name: 'Target', value: `<@${infraction.targetUserId}> (${infraction.targetUsername})`, inline: false },
        { name: 'Issuer', value: `<@${infraction.issuerUserId}> (${infraction.issuerUsername})`, inline: true },
        { name: 'Created At', value: `<t:${Math.floor(infraction.createdAt.getTime() / 1000)}:F>`, inline: true },
        { name: 'Reason', value: infraction.reason, inline: false }
      )
      .setTimestamp();
    
    // Set color based on status
    switch (infraction.status) {
      case 'Pending':
        embed.setColor('#FFA500'); // Orange
        break;
      case 'Approved':
        embed.setColor('#00FF00'); // Green
        break;
      case 'Denied':
        embed.setColor('#808080'); // Gray
        break;
      case 'Completed':
        embed.setColor('#0000FF'); // Blue
        break;
      case 'Expired':
        embed.setColor('#800080'); // Purple
        break;
      case 'Appealed':
        embed.setColor('#FFC0CB'); // Pink
        break;
      default:
        embed.setColor('#000000'); // Black
    }
    
    // Add evidence if available
    if (infraction.evidence && infraction.evidence.length > 0) {
      embed.addFields({ name: 'Evidence', value: infraction.evidence.join('\n'), inline: true });
    }
    
    // Add approval data if available
    if (infraction.approvalData && infraction.approvalData.approvedBy) {
      embed.addFields({ 
        name: 'Approved By', 
        value: `<@${infraction.approvalData.approvedBy}> (${infraction.approvalData.approvedByUsername})`, 
        inline: true 
      });
      
      embed.addFields({ 
        name: 'Approved At', 
        value: `<t:${Math.floor(infraction.approvalData.approvedAt.getTime() / 1000)}:F>`, 
        inline: true 
      });
      
      if (infraction.approvalData.notes) {
        embed.addFields({ name: 'Approval Notes', value: infraction.approvalData.notes, inline: false });
      }
    }
    
    // Add denial data if available
    if (infraction.denialData && infraction.denialData.deniedBy) {
      embed.addFields({ 
        name: 'Denied By', 
        value: `<@${infraction.denialData.deniedBy}> (${infraction.denialData.deniedByUsername})`, 
        inline: true 
      });
      
      embed.addFields({ 
        name: 'Denied At', 
        value: `<t:${Math.floor(infraction.denialData.deniedAt.getTime() / 1000)}:F>`, 
        inline: true 
      });
      
      embed.addFields({ name: 'Denial Reason', value: infraction.denialData.reason, inline: false });
    }
    
    // Add suspension data if available
    if (infraction.suspensionData) {
      embed.addFields({ name: 'Duration', value: infraction.suspensionData.duration, inline: true });
      
      embed.addFields({ 
        name: 'Started At', 
        value: `<t:${Math.floor(infraction.suspensionData.startedAt.getTime() / 1000)}:F>`, 
        inline: true 
      });
      
      embed.addFields({ 
        name: 'Expires At', 
        value: `<t:${Math.floor(infraction.suspensionData.expiresAt.getTime() / 1000)}:F>`, 
        inline: true 
      });
      
      const now = new Date();
      if (infraction.suspensionData.expiresAt > now) {
        embed.addFields({ 
          name: 'Time Remaining', 
          value: `<t:${Math.floor(infraction.suspensionData.expiresAt.getTime() / 1000)}:R>`, 
          inline: true 
        });
      }
    }
    
    // Add appeal data if available
    if (infraction.appealData && infraction.appealData.appealedAt) {
      embed.addFields({ 
        name: 'Appealed At', 
        value: `<t:${Math.floor(infraction.appealData.appealedAt.getTime() / 1000)}:F>`, 
        inline: true 
      });
      
      embed.addFields({ name: 'Appeal Reason', value: infraction.appealData.appealReason, inline: false });
      
      embed.addFields({ name: 'Appeal Status', value: infraction.appealData.appealStatus, inline: true });
      
      if (infraction.appealData.handledBy) {
        embed.addFields({ name: 'Handled By', value: infraction.appealData.handledBy, inline: true });
        embed.addFields({ 
          name: 'Handled At', 
          value: `<t:${Math.floor(infraction.appealData.handledAt.getTime() / 1000)}:F>`, 
          inline: true 
        });
        
        if (infraction.appealData.notes) {
          embed.addFields({ name: 'Notes', value: infraction.appealData.notes, inline: false });
        }
      }
    }
    
    await interaction.editReply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    logger.error(`Error viewing infraction: ${error.message}`);
    await interaction.editReply({
      content: 'An error occurred while viewing the infraction.',
      ephemeral: true
    });
    throw error;
  }
}

/**
 * Handle listing infractions
 */
async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const user = interaction.options.getUser('user');
    const status = interaction.options.getString('status') || 'all';
    const limit = interaction.options.getInteger('limit') || 10;
    
    // Build the query based on options
    const query = {};
    
    if (user) {
      query.targetUserId = user.id;
    }
    
    if (status !== 'all') {
      query.status = status;
    }
    
    // Fetch infractions from the database
    const infractions = await Infraction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    if (infractions.length === 0) {
      return await interaction.editReply({
        content: user 
          ? `No infractions found for ${user.username} with status: ${status}.`
          : `No infractions found with status: ${status}.`,
        ephemeral: true
      });
    }
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle('Infractions List')
      .setDescription(user 
        ? `Showing infractions for ${user.username}`
        : `Showing recent infractions`)
      .setTimestamp();
    
    // Add each infraction to the embed
    for (const infraction of infractions) {
      const fieldName = `${infraction.type} - ${infraction.status} (${infraction._id})`;
      const fieldValue = `
        **Target:** <@${infraction.targetUserId}> (${infraction.targetUsername})
        **Issuer:** <@${infraction.issuerUserId}> (${infraction.issuerUsername})
        **Date:** <t:${Math.floor(new Date(infraction.createdAt).getTime() / 1000)}:F>
        **Reason:** ${infraction.reason.substring(0, 100)}${infraction.reason.length > 100 ? '...' : ''}
      `.trim();
      
      embed.addFields({ name: fieldName, value: fieldValue });
    }
    
    // Add pagination message if applicable
    if (limit < 10 || infractions.length < limit) {
      embed.setFooter({ text: `Showing ${infractions.length} infraction(s)` });
    } else {
      embed.setFooter({ text: `Showing ${infractions.length} of ${await Infraction.countDocuments(query)} infractions. Use a higher limit to see more.` });
    }
    
    await interaction.editReply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    logger.error(`Error listing infractions: ${error.message}`);
    await interaction.editReply({
      content: 'An error occurred while listing infractions.',
      ephemeral: true
    });
    throw error;
  }
}

/**
 * Execute a suspension
 */
async function executeSuspension(interaction, targetMember, infraction) {
  try {
    // Record the user's current roles
    const currentRoles = targetMember.roles.cache.filter(role => 
      // Only include staff roles, not @everyone or other non-staff roles
      role.id !== interaction.guild.id && 
      !role.managed && 
      role.id !== roleIds.Suspended &&
      role.id !== roleIds.Blacklisted &&
      role.id !== roleIds.UnderInvestigation
    ).map(role => role.id);
    
    // Record the current roles in the database
    if (config.infractionSettings.autoRemoveRolesOnSuspension) {
      // Update the infraction with previous roles
      infraction.suspensionData.previousRoles = currentRoles;
      await infraction.save();
      
      // Also update in the User model
      await User.findOneAndUpdate(
        { userId: targetMember.id },
        { 
          specialStatus: 'Suspended',
          'suspensionData.expiresAt': infraction.suspensionData.expiresAt,
          'suspensionData.previousRoles': currentRoles
        },
        { upsert: true }
      );
      
      // Remove all staff roles from the user
      for (const roleId of currentRoles) {
        try {
          await targetMember.roles.remove(roleId);
        } catch (removeError) {
          logger.warn(`Could not remove role ${roleId} from ${targetMember.user.tag}: ${removeError.message}`);
        }
      }
    }
    
    // Add the Suspended role
    await targetMember.roles.add(roleIds.Suspended);
    
    // Create a log entry for role changes
    const logEntry = new AuditLog({
      actionType: 'Suspension_Started',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: targetMember.id,
        username: targetMember.user.username
      },
      details: {
        removedRoles: currentRoles,
        expiresAt: infraction.suspensionData.expiresAt,
        duration: infraction.suspensionData.duration
      },
      relatedIds: {
        infractionId: infraction._id
      }
    });
    
    await logEntry.save();
    
    logger.info(`Suspension executed for ${targetMember.user.tag} (${targetMember.id}). Expires: ${infraction.suspensionData.expiresAt}`);
  } catch (error) {
    logger.error(`Error executing suspension: ${error.message}`);
    throw error;
  }
}

/**
 * Execute a demotion
 */
async function executeDemotion(interaction, targetMember, infraction) {
  // This function would need to be implemented based on the promotion system
  // Since demotions involve complex rank changes, we'd need integration with
  // the role hierarchy system
  
  // For now, we'll just update the user's special status
  try {
    // Update user model
    await User.findOneAndUpdate(
      { userId: targetMember.id },
      { 
        $push: {
          previousRanks: {
            rank: 'Unknown', // would need to determine current rank
            rankId: 'Unknown',
            from: new Date(0), // placeholder
            to: new Date(),
            promotedBy: infraction.issuerUserId,
            reason: infraction.reason
          }
        }
      },
      { upsert: true }
    );
    
    logger.info(`Demotion recorded for ${targetMember.user.tag} (${targetMember.id}).`);
  } catch (error) {
    logger.error(`Error recording demotion: ${error.message}`);
    throw error;
  }
}

/**
 * Execute a termination
 */
async function executeTermination(interaction, targetMember, infraction) {
  try {
    // Record the user's current roles
    const currentRoles = targetMember.roles.cache.filter(role => 
      // Only include staff roles, not @everyone or other non-staff roles
      role.id !== interaction.guild.id && 
      !role.managed &&
      role.id !== roleIds.Suspended &&
      role.id !== roleIds.Blacklisted &&
      role.id !== roleIds.UnderInvestigation
    ).map(role => role.id);
    
    // Update the User model
    await User.findOneAndUpdate(
      { userId: targetMember.id },
      { 
        isActive: false,
        // Store previous roles in case of future reinstatement
        'terminationData': {
          previousRoles: currentRoles,
          terminatedAt: new Date(),
          reason: infraction.reason
        }
      },
      { upsert: true }
    );
    
    // Remove all staff roles from the user
    for (const roleId of currentRoles) {
      try {
        await targetMember.roles.remove(roleId);
      } catch (removeError) {
        logger.warn(`Could not remove role ${roleId} from ${targetMember.user.tag}: ${removeError.message}`);
      }
    }
    
    // Create a log entry for role changes
    const logEntry = new AuditLog({
      actionType: 'Roles_Updated',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: targetMember.id,
        username: targetMember.user.username
      },
      details: {
        action: 'Termination',
        removedRoles: currentRoles
      },
      relatedIds: {
        infractionId: infraction._id
      }
    });
    
    await logEntry.save();
    
    logger.info(`Termination executed for ${targetMember.user.tag} (${targetMember.id}).`);
  } catch (error) {
    logger.error(`Error executing termination: ${error.message}`);
    throw error;
  }
} 

/**
 * Execute a blacklist
 */
async function executeBlacklist(interaction, targetMember, infraction) {
  try {
    // Record the user's current roles
    const currentRoles = targetMember.roles.cache.filter(role => 
      // Only include staff roles, not @everyone or other non-staff roles
      role.id !== interaction.guild.id && 
      !role.managed &&
      role.id !== roleIds.Suspended &&
      role.id !== roleIds.Blacklisted &&
      role.id !== roleIds.UnderInvestigation
    ).map(role => role.id);
    
    // Update the User model
    await User.findOneAndUpdate(
      { userId: targetMember.id },
      { 
        specialStatus: 'Blacklisted',
        isActive: false
      },
      { upsert: true }
    );
    
    // Remove all staff roles from the user
    for (const roleId of currentRoles) {
      try {
        await targetMember.roles.remove(roleId);
      } catch (removeError) {
        logger.warn(`Could not remove role ${roleId} from ${targetMember.user.tag}: ${removeError.message}`);
      }
    }
    
    // Add the Blacklisted role
    await targetMember.roles.add(roleIds.Blacklisted);
    
    // Create a log entry for role changes
    const logEntry = new AuditLog({
      actionType: 'Roles_Updated',
      performedBy: {
        userId: interaction.user.id,
        username: interaction.user.username
      },
      targetUser: {
        userId: targetMember.id,
        username: targetMember.user.username
      },
      details: {
        action: 'Blacklist',
        removedRoles: currentRoles,
        addedRoles: [roleIds.Blacklisted]
      },
      relatedIds: {
        infractionId: infraction._id
      }
    });
    
    await logEntry.save();
    
    logger.info(`Blacklist executed for ${targetMember.user.tag} (${targetMember.id}).`);
  } catch (error) {
    logger.error(`Error executing blacklist: ${error.message}`);
    throw error;
  }
}

// Button handlers for approval/denial from messages
module.exports.buttons = {
  async approve(interaction, args) {
    try {
      const infractionId = args[0];
      
      // Create a modal to collect notes
      const modal = new ModalBuilder()
        .setCustomId(`infraction:approveModal:${infractionId}`)
        .setTitle('Approve Infraction');

       const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Approval Notes (Optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Enter any notes about this approval...')
        .setMaxLength(1000);

      const firstActionRow = new ActionRowBuilder().addComponents(notesInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Infraction Approval Button');
    }
  },
  
  async deny(interaction, args) {
    try {
      const infractionId = args[0];
      
      // Create a modal to collect reason
      const modal = new Modal()
        .setCustomId(`infraction:denyModal:${infractionId}`)
        .setTitle('Deny Infraction');
      
      const reasonInput = new TextInputComponent()
        .setCustomId('reason')
        .setLabel('Reason for Denial')
        .setStyle('PARAGRAPH')
        .setRequired(true)
        .setPlaceholder('Enter the reason for denying this infraction...')
        .setMaxLength(1000);
      
      const firstActionRow = new MessageActionRow().addComponents(reasonInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Infraction Denial Button');
    }
  }
};

// Modal handlers for approval/denial inputs
module.exports.modals = {
  async approveModal(interaction, args) {
    try {
      const infractionId = args[0];
      const notes = interaction.fields.getTextInputValue('notes');
      
      // Set options as if it came from the command
      interaction.options = {
        getString: (name) => {
          if (name === 'infraction_id') return infractionId;
          if (name === 'notes') return notes;
          return null;
        }
      };
      
      // Call the same handler used by the command
      await handleApprove(interaction);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Infraction Approval Modal');
    }
  },
  
  async denyModal(interaction, args) {
    try {
      const infractionId = args[0];
      const reason = interaction.fields.getTextInputValue('reason');
      
      // Set options as if it came from the command
      interaction.options = {
        getString: (name) => {
          if (name === 'infraction_id') return infractionId;
          if (name === 'reason') return reason;
          return null;
        }
      };
      
      // Call the same handler used by the command
      await handleDeny(interaction);
    } catch (error) {
      await ErrorHandler.handleInteractionError(error, interaction, 'Infraction Denial Modal');
    }
  }
};