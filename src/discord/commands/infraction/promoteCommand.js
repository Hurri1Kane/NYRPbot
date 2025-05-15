// src/discord/commands/staff/promoteCommand.js
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { PERMISSION_PRESETS } = require('../../utils/permissionManager');
const ErrorHandler = require('../../../utils/errorHandler');
const logger = require('../../../utils/logger');
const User = require('../../../database/models/User');
const Promotion = require('../../../database/models/Promotion');
const AuditLog = require('../../../database/models/AuditLog');
const { roleIds, roleNames, roleGroups, rankToCategoryMap } = require('../../../config/roles');
const { channelIds } = require('../../../config/channels');
const config = require('../../../config/config');
const { safeReply, safeDefer } = require('../../events/interactionCreate');

// Map to store available promotions for each rank
const promotionPaths = new Map();

// Initialize promotion paths - which rank can be promoted to which rank
function initializePromotionPaths() {
  // Moderation path
  promotionPaths.set(roleIds.TrialModerator, [roleIds.Moderator]);
  promotionPaths.set(roleIds.Moderator, [roleIds.SeniorModerator]);
  promotionPaths.set(roleIds.SeniorModerator, [roleIds.HeadModerator, roleIds.TrialAdministrator]);
  promotionPaths.set(roleIds.HeadModerator, [roleIds.TrialAdministrator]);
  
  // Administration path
  promotionPaths.set(roleIds.TrialAdministrator, [roleIds.Administrator]);
  promotionPaths.set(roleIds.Administrator, [roleIds.SeniorAdministrator]);
  promotionPaths.set(roleIds.SeniorAdministrator, [roleIds.HeadAdministrator, roleIds.TrialInternalAffairs]);
  promotionPaths.set(roleIds.HeadAdministrator, [roleIds.TrialInternalAffairs]);
  
  // Internal Affairs path
  promotionPaths.set(roleIds.TrialInternalAffairs, [roleIds.InternalAffairs]);
  promotionPaths.set(roleIds.InternalAffairs, [roleIds.InternalAffairsDirector, roleIds.StaffSupervisorInTraining]);
  promotionPaths.set(roleIds.InternalAffairsDirector, [roleIds.StaffSupervisorInTraining]);

  // Management path
  promotionPaths.set(roleIds.TrialManager, [roleIds.Manager]);
  promotionPaths.set(roleIds.Manager, [roleIds.SeniorManager]);
  
  // Dir  ective path
   promotionPaths.set(roleIds.SeniorManager, [roleIds.AssistantDirector]);
  promotionPaths.set(roleIds.AssistantDirector, [roleIds.LeadAssistantDirector]);
  promotionPaths.set(roleIds.LeadAssistantDirector, [roleIds.ViceDeputyDirector]);
  promotionPaths.set(roleIds.ViceDeputyDirector, [roleIds.DeputyDirector]);
  promotionPaths.set(roleIds.DeputyDirector, [roleIds.Director]);
  promotionPaths.set(roleIds.Director, []); // No higher rank
}

// Initialize the promotion paths
initializePromotionPaths();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a staff member')
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The staff member to promote')
        .setRequired(true)
    )
    .addStringOption(option => 
      option
        .setName('reason')
        .setDescription('Reason for the promotion')
        .setRequired(true)
    )
    .addStringOption(option => 
      option
        .setName('rank')
        .setDescription('The rank to promote to (optional, will suggest available ranks)')
        .setRequired(false)
        .setAutocomplete(true)
    ),
  
  // Only directors can promote staff
  permissions: PERMISSION_PRESETS.DIRECTOR_PLUS,
  
  // Autocomplete handler for rank selection
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'rank') {
        const user = interaction.options.getUser('user');
        
        // If no user is selected yet, show a message
        if (!user) {
          return await interaction.respond([
            { name: 'Please select a user first', value: 'none' }
          ]);
        }
        
        // Get the member from the guild
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        
        if (!member) {
          return await interaction.respond([
            { name: 'User not found in server', value: 'none' }
          ]);
        }
        
        // Check if user has any staff roles
        if (!member.roles.cache.has(roleIds.NyrpStaffTeam)) {
          return await interaction.respond([
            { name: 'User is not a staff member', value: 'none' }
          ]);
        }
        
        // Find the user's highest role
        let highestRoleId = null;
        
        for (const roleId of roleGroups.allRanks) {
          if (member.roles.cache.has(roleId)) {
            highestRoleId = roleId;
            break;
          }
        }
        
        if (!highestRoleId) {
          return await interaction.respond([
            { name: 'User has no specific rank role', value: 'none' }
          ]);
        }
        
        // Get available promotion options
        const availablePromotions = promotionPaths.get(highestRoleId) || [];
        
        if (availablePromotions.length === 0) {
          return await interaction.respond([
            { name: 'No promotion paths available for this user', value: 'none' }
          ]);
        }
        
        // Create choices based on available promotions
        const choices = availablePromotions.map(roleId => ({
          name: `${roleNames[highestRoleId]} → ${roleNames[roleId]}`,
          value: roleId
        }));
        
        await interaction.respond(choices);
      }
    } catch (error) {
      logger.error(`Error in promote autocomplete: ${error.message}`);
      // For autocomplete, we can only log the error, not respond to the interaction
      await interaction.respond([{ name: 'Error loading ranks', value: 'error' }]);
    }
  },
  
  async execute(interaction) {
    const interactionKey = `${interaction.id}-${interaction.user.id}`;
    await safeDefer(interaction, { ephemeral: true }, interactionKey);
    
    try {
      const user = interaction.options.getUser('user');
      let rankId = interaction.options.getString('rank');
      const reason = interaction.options.getString('reason');
      
      // Check if reason meets minimum length requirements
      if (config.promotionSettings.requireReason && 
          reason.length < config.promotionSettings.minReasonLength) {
        return await safeReply(interaction, {
          content: `The promotion reason must be at least ${config.promotionSettings.minReasonLength} characters long.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // Get the member from the guild
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      if (!member) {
        return await safeReply(interaction, {
          content: 'Unable to find the target user in this server.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if member is a staff member
      if (!member.roles.cache.has(roleIds.NyrpStaffTeam)) {
        return await safeReply(interaction, {
          content: 'The target user is not a staff member.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Check if user has any special status
      if (member.roles.cache.has(roleIds.Suspended)) {
        return await safeReply(interaction, {
          content: 'The target user is currently suspended and cannot be promoted.',
          ephemeral: true
        }, interactionKey);
      }
      
      if (member.roles.cache.has(roleIds.Blacklisted)) {
        return await safeReply(interaction, {
          content: 'The target user is blacklisted and cannot be promoted.',
          ephemeral: true
        }, interactionKey);
      }
      
      if (member.roles.cache.has(roleIds.UnderInvestigation)) {
        return await safeReply(interaction, {
          content: 'The target user is currently under investigation and cannot be promoted.',
          ephemeral: true
        }, interactionKey);
      }
      
      // Find the user's current highest role
      let currentRoleId = null;
      let currentRoleName = null;
      
      for (const roleId of roleGroups.allRanks) {
        if (member.roles.cache.has(roleId)) {
          currentRoleId = roleId;
          currentRoleName = roleNames[roleId];
          break;
        }
      }
      
      if (!currentRoleId) {
        return await safeReply(interaction, {
          content: 'The target user has no specific rank role. Please assign a rank manually before promoting.',
          ephemeral: true
        }, interactionKey);
      }
      
      // If rank not specified, suggest available promotions
      if (!rankId) {
        const availablePromotions = promotionPaths.get(currentRoleId) || [];
        
        if (availablePromotions.length === 0) {
          return await safeReply(interaction, {
            content: `${user.username} is currently a ${currentRoleName} and has no available promotion paths.`,
            ephemeral: true
          }, interactionKey);
        }
        
        // If only one promotion path, use that
        if (availablePromotions.length === 1) {
          rankId = availablePromotions[0];
        } else {
          // Otherwise, ask the user to specify
          const promotionOptions = availablePromotions.map(roleId => 
            `• ${currentRoleName} → ${roleNames[roleId]}`
          ).join('\n');
          
          return await safeReply(interaction, {
            content: `${user.username} is currently a ${currentRoleName} and can be promoted to multiple ranks. Please specify a rank using the \`rank\` option.\n\nAvailable promotions:\n${promotionOptions}`,
            ephemeral: true
          }, interactionKey);
        }
      }
      
      // Verify the promotion is valid
      const availablePromotions = promotionPaths.get(currentRoleId) || [];
      
      if (!availablePromotions.includes(rankId) && !config.promotionSettings.allowSkipRanks) {
        return await safeReply(interaction, {
          content: `Invalid promotion path. ${user.username} is currently a ${currentRoleName} and cannot be directly promoted to ${roleNames[rankId]}.`,
          ephemeral: true
        }, interactionKey);
      }
      
      // All checks passed, proceed with promotion
      
      // Record the promotion in the database
      const newRoleName = roleNames[rankId];
      
      const promotionRecord = new Promotion({
        userId: user.id,
        username: user.username || user.tag || 'Unknown',  // Ensure username is provided
        promotedBy: interaction.user.id,
        promotedByUsername: interaction.user.username || interaction.user.tag || 'Unknown',  // Ensure promotedByUsername is provided
        previousRank: currentRoleName,
        previousRankId: currentRoleId,
        newRank: newRoleName,
        newRankId: rankId,
        reason
      });
      
      await promotionRecord.save();
      
      // Get or create the user record in the database
      let userRecord = await User.findOne({ userId: user.id });
      
      if (!userRecord) {
        userRecord = new User({
          userId: user.id,
          username: user.username || user.tag || `User_${user.id}`,  // Ensure username is provided with fallbacks
          currentRank: currentRoleName,
          rankId: currentRoleId,
          joinedAt: new Date(),
          isActive: true
        });
      } else if (!userRecord.username) {
        // Make sure the username is set even for existing users
        userRecord.username = user.username || user.tag || `User_${user.id}`;
      }
      
      // Update the user record with new rank and add previous rank to history
      userRecord.previousRanks.push({
        rank: userRecord.currentRank,
        rankId: userRecord.rankId,
        from: userRecord.joinedAt,
        to: new Date(),
        promotedBy: interaction.user.id,
        reason
      });
      
      userRecord.currentRank = newRoleName;
      userRecord.rankId = rankId;
      
      await userRecord.save();
      
      // Update Discord roles
      try {
        // Remove current rank role
        await member.roles.remove(currentRoleId);
        
        // Add new rank role
        await member.roles.add(rankId);
        
        // Update category roles if needed
        const currentCategory = rankToCategoryMap[currentRoleId];
        const newCategory = rankToCategoryMap[rankId];
        
        if (currentCategory !== newCategory) {
          // Remove old category if it exists
          if (currentCategory) {
            await member.roles.remove(currentCategory);
          }
          
          // Add new category if it exists
          if (newCategory) {
            await member.roles.add(newCategory);
          }
        }
        
        // Update High Rank status if needed
        const isNewHighRank = roleGroups.highRanks.includes(rankId);
        const wasHighRank = roleGroups.highRanks.includes(currentRoleId);
        
        if (isNewHighRank && !wasHighRank) {
          await member.roles.add(roleIds.HighRank);
        } else if (!isNewHighRank && wasHighRank) {
          await member.roles.remove(roleIds.HighRank);
        }
        
        // Update Senior High Rank status if needed
        const isNewSeniorHighRank = roleGroups.seniorHighRanks.includes(rankId);
        const wasSeniorHighRank = roleGroups.seniorHighRanks.includes(currentRoleId);
        
        if (isNewSeniorHighRank && !wasSeniorHighRank) {
          await member.roles.add(roleIds.SeniorHighRank);
        } else if (!isNewSeniorHighRank && wasSeniorHighRank) {
          await member.roles.remove(roleIds.SeniorHighRank);
        }
      } catch (roleError) {
        logger.error(`Failed to update roles for ${user.tag || user.id}: ${roleError.message}`);
        
        // Respond with partial success
        await safeReply(interaction, {
          content: `Promotion recorded in database, but failed to update Discord roles: ${roleError.message}`,
          ephemeral: true
        }, interactionKey);
        
        return;
      }
      
      // Create audit log entry
      const logEntry = new AuditLog({
        actionType: 'Promotion_Executed',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.username || interaction.user.tag || 'Unknown'  // Ensure username is provided
        },
        targetUser: {
          userId: user.id,
          username: user.username || user.tag || 'Unknown'  // Ensure username is provided
        },
        details: {
          previousRank: currentRoleName,
          newRank: newRoleName,
          reason
        },
        relatedIds: {
          promotionId: promotionRecord._id
        }
      });
      
      await logEntry.save();
      
      // Send confirmation to the user
      await safeReply(interaction, {
        content: `Successfully promoted ${user} from ${currentRoleName} to ${newRoleName}.`,
        ephemeral: true
      }, interactionKey);
      
      // Announce in the promotion channel if configured
      if (config.promotionSettings.announcePromotions) {
        try {
          const announceChannel = await interaction.guild.channels.fetch(channelIds.infractionPromotionAnnouncement);
          
          if (announceChannel) {
            const announcementEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Staff Promotion')
              .setDescription(`A staff member has been promoted!`)
              .addFields(
                { name: 'Staff Member', value: `${user}`, inline: false },
                { name: 'Previous Rank', value: currentRoleName, inline: true },
                { name: 'New Rank', value: newRoleName, inline: true },
              )
              .setTimestamp()

              // Create the non-interactive button/label
            const promotedByButton = new ButtonBuilder()
              .setCustomId('promoted-by')
              .setLabel(`Promoted by: ${interaction.member.displayName}`)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true); // This makes it non-interactive

            // Add the button to an action row
            const actionRow = new ActionRowBuilder()
              .addComponents(promotedByButton);

            // Send the announcement with both the embed and the action row
            const announcementMsg = await announceChannel.send({ 
              embeds: [announcementEmbed],
              components: [actionRow]
            });
          
            
            // Update the promotion record with the announcement message ID
            promotionRecord.announcementMessageId = announcementMsg.id;
            await promotionRecord.save();
          }
        } catch (announceError) {
          logger.warn(`Failed to send promotion announcement: ${announceError.message}`);
        }
      }
      
      // Send DM to the promoted user if configured
      if (config.promotionSettings.dmPromotedUsers) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('You Have Been Promoted!')
            .setDescription(`Congratulations! You have been promoted from ${currentRoleName} to ${newRoleName}.`)
            .addFields(
              { name: 'Reason', value: reason, inline: false },
              { name: 'Promoted By', value: interaction.user.username || interaction.user.tag || 'A director', inline: true }
            )
            .setTimestamp();

          await user.send({ 
            embeds: [dmEmbed],
          });
                    
          await user.send({ embeds: [dmEmbed] });
        } catch (dmError) {
          logger.warn(`Failed to send promotion DM to ${user.tag || user.id}: ${dmError.message}`);
        }
      }
    } catch (error) {
      const errorId = ErrorHandler.handleInteractionError(error, interaction, 'Promote Command');
      
      await safeReply(interaction, {
        content: `An error occurred while processing the promotion. Error ID: ${errorId}`,
        ephemeral: true
      }, interactionKey);
    }
  }
};