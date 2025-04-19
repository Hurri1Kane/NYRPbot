// src/discord/utils/suspensionChecker.js
const { EmbedBuilder } = require('discord.js');
const Infraction = require('../../database/models/Infraction');
const User = require('../../database/models/User');
const AuditLog = require('../../database/models/AuditLog');
const { roleIds, roleNames } = require('../../config/roles');
const { channelIds } = require('../../config/channels');
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/errorHandler');

// Default config values if main config fails to load
const DEFAULT_CONFIG = {
  infractionSettings: {
    checkExpirationInterval: 300000, // 5 minutes default
    notifyOnExpiration: true,
    autoRemoveRolesOnSuspension: true
  }
};

/**
 * Suspension expiration checker system
 * Automatically checks for expired suspensions and restores roles
 */
class SuspensionChecker {
  constructor(client) {
    this.client = client;
    
    // Try to load config, fall back to defaults if needed
    let config;
    try {
      config = require('../../config/config');
      if (!config.infractionSettings || !config.infractionSettings.checkExpirationInterval) {
        logger.warn('infractionSettings.checkExpirationInterval missing in config, using default value (5 minutes)');
        config.infractionSettings = config.infractionSettings || {};
        config.infractionSettings.checkExpirationInterval = DEFAULT_CONFIG.infractionSettings.checkExpirationInterval;
      }
    } catch (configError) {
      logger.warn(`Failed to load config module: ${configError.message}. Using default suspension settings.`);
      config = DEFAULT_CONFIG;
    }
    
    this.checkInterval = config.infractionSettings.checkExpirationInterval;
    this.notifyOnExpiration = config.infractionSettings.notifyOnExpiration !== false; // Default to true if not explicitly set to false
    this.autoRemoveRolesOnSuspension = config.infractionSettings.autoRemoveRolesOnSuspension !== false; // Default to true if not explicitly set to false
    this.intervalId = null;
    this.isRunning = false;
    
    logger.debug(`SuspensionChecker initialized with interval: ${this.checkInterval}ms`);
  }
  
  /**
   * Start the automatic suspension checker
   */
  start() {
    if (this.intervalId) {
      logger.warn('Suspension checker already running');
      return;
    }
    
    logger.info(`Starting suspension checker to run every ${this.checkInterval / 60000} minutes`);
    
    // Run once immediately
    this.checkExpiredSuspensions();
    
    // Schedule regular checks
    this.intervalId = setInterval(() => {
      this.checkExpiredSuspensions();
    }, this.checkInterval);
    
    this.isRunning = true;
  }
  
  /**
   * Stop the automatic suspension checker
   */
  stop() {
    if (!this.intervalId) {
      logger.warn('Suspension checker not running');
      return;
    }
    
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    
    logger.info('Suspension checker stopped');
  }
  
  /**
   * Check for expired suspensions and handle them
   */
  async checkExpiredSuspensions() {
    // Prevent concurrent runs
    if (this._isChecking) {
      logger.debug('Suspension check already in progress, skipping');
      return;
    }
    
    this._isChecking = true;
    
    try {
      const now = new Date();
      
      // Find suspensions that have expired but are still active
      const expiredInfractions = await Infraction.find({
        type: 'Suspension',
        status: 'Approved',
        'suspensionData.expiresAt': { $lt: now }
      });
      
      logger.debug(`Found ${expiredInfractions.length} expired suspensions to process`);
      
      // Process each expired suspension
      for (const infraction of expiredInfractions) {
        try {
          await this.handleExpiredSuspension(infraction);
        } catch (error) {
          // Log but continue with other suspensions
          const errorId = ErrorHandler.handleBackgroundError(
            error, 
            `SuspensionChecker:handleExpiredSuspension:${infraction._id}`
          );
          logger.error(`Error handling expired suspension ${infraction._id}: ${error.message} (Error ID: ${errorId})`);
        }
      }
      
      // Also check user model for any that might have been missed
      const expiredUsers = await User.find({
        specialStatus: 'Suspended',
        'suspensionData.expiresAt': { $lt: now }
      });
      
      logger.debug(`Found ${expiredUsers.length} expired suspensions in users table to process`);
      
      // Process each expired user
      for (const user of expiredUsers) {
        try {
          // Find matching infraction first
          const relatedInfraction = await Infraction.findOne({
            targetUserId: user.userId,
            type: 'Suspension',
            status: 'Approved'
          }).sort({ createdAt: -1 });
          
          if (relatedInfraction) {
            // If already processed, skip
            if (relatedInfraction.status === 'Completed') {
              // Just update the user
              user.specialStatus = null;
              user.suspensionData = null;
              await user.save();
              continue;
            }
            
            await this.handleExpiredSuspension(relatedInfraction);
          } else {
            // No infraction found, but user is marked suspended
            // Handle directly from user record
            await this.handleExpiredUserSuspension(user);
          }
        } catch (error) {
          // Log but continue with other users
          const errorId = ErrorHandler.handleBackgroundError(
            error, 
            `SuspensionChecker:handleExpiredUserSuspension:${user.userId}`
          );
          logger.error(`Error handling expired user suspension ${user.userId}: ${error.message} (Error ID: ${errorId})`);
        }
      }
    } catch (error) {
      const errorId = ErrorHandler.handleBackgroundError(error, 'SuspensionChecker:checkExpiredSuspensions');
      logger.error(`Error checking expired suspensions: ${error.message} (Error ID: ${errorId})`);
    } finally {
      this._isChecking = false;
    }
  }
  
  /**
   * Handle an expired suspension
   * @param {Object} infraction - The expired infraction record
   */
  async handleExpiredSuspension(infraction) {
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      throw new Error('No guild available to handle suspension expiration');
    }
    
    logger.info(`Handling expired suspension for user ${infraction.targetUserId} (Infraction ID: ${infraction._id})`);
    
    // Update infraction status
    infraction.status = 'Completed';
    await infraction.save();
    
    // Get the user
    let member;
    try {
      member = await guild.members.fetch(infraction.targetUserId);
    } catch (error) {
      logger.warn(`Could not fetch member ${infraction.targetUserId}: ${error.message}`);
      
      // Create a log for missing member
      const errorLogEntry = new AuditLog({
        actionType: 'Suspension_Ended',
        performedBy: {
          userId: this.client.user.id,
          username: this.client.user.username,
          rank: 'Bot'
        },
        targetUser: {
          userId: infraction.targetUserId,
          username: infraction.targetUsername
        },
        details: {
          status: 'Failed - Member not in server',
          infractionId: infraction._id,
          expirationTime: infraction.suspensionData.expiresAt
        },
        relatedIds: {
          infractionId: infraction._id
        }
      });
      
      await errorLogEntry.save();
      return;
    }
    
    // Get the user from database to restore roles
    const user = await User.findOne({ userId: infraction.targetUserId });
    
    if (!user) {
      logger.warn(`No user record found for ${infraction.targetUserId}`);
      
      // Try to restore from infraction instead
      if (infraction.suspensionData && infraction.suspensionData.previousRoles) {
        await this.restoreRoles(member, infraction.suspensionData.previousRoles, infraction._id);
      } else {
        logger.error(`Cannot restore roles for ${infraction.targetUserId} - no previous roles recorded`);
      }
    } else {
      // Update user status
      user.specialStatus = null;
      
      // Restore roles if we have them
      if (user.suspensionData && user.suspensionData.previousRoles) {
        await this.restoreRoles(member, user.suspensionData.previousRoles, infraction._id);
      } else if (infraction.suspensionData && infraction.suspensionData.previousRoles) {
        await this.restoreRoles(member, infraction.suspensionData.previousRoles, infraction._id);
      } else {
        logger.error(`Cannot restore roles for ${user.userId} - no previous roles recorded`);
      }
      
      // Clear suspension data
      user.suspensionData = null;
      await user.save();
    }
    
    // Send DM to user if configured
    if (this.notifyOnExpiration) {
      try {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Suspension Expired')
              .setDescription('Your suspension from the NYRP Staff Team has expired and your roles have been restored.')
              .addFields({ name: 'Infraction ID', value: infraction._id.toString() })
              .setTimestamp()
          ]
        });
      } catch (error) {
        logger.warn(`Could not send DM to ${member.user.tag}: ${error.message}`);
      }
    }
    
    // Announce in staff log channel
    try {
      const staffLogChannel = await guild.channels.fetch(channelIds.staffLog);
      
      if (staffLogChannel) {
        await staffLogChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Suspension Expired')
              .setDescription(`<@${infraction.targetUserId}>'s suspension has expired and their roles have been restored automatically.`)
              .addFields({ name: 'Infraction ID', value: infraction._id.toString() })
              .setTimestamp()
          ]
        });
      }
    } catch (error) {
      logger.warn(`Could not send announcement to staff log: ${error.message}`);
    }
  }
  
  /**
   * Handle an expired user suspension when no infraction record is found
   * @param {Object} user - The user record with expired suspension
   */
  async handleExpiredUserSuspension(user) {
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      throw new Error('No guild available to handle suspension expiration');
    }
    
    logger.info(`Handling expired suspension for user ${user.userId} from user record`);
    
    // Get the user
    let member;
    try {
      member = await guild.members.fetch(user.userId);
    } catch (error) {
      logger.warn(`Could not fetch member ${user.userId}: ${error.message}`);
      
      // Create a log for missing member
      const errorLogEntry = new AuditLog({
        actionType: 'Suspension_Ended',
        performedBy: {
          userId: this.client.user.id,
          username: this.client.user.username,
          rank: 'Bot'
        },
        targetUser: {
          userId: user.userId,
          username: user.username
        },
        details: {
          status: 'Failed - Member not in server',
          expirationTime: user.suspensionData?.expiresAt
        }
      });
      
      await errorLogEntry.save();
      
      // Update user record anyway
      user.specialStatus = null;
      user.suspensionData = null;
      await user.save();
      
      return;
    }
    
    // Restore roles if we have them
    if (user.suspensionData && user.suspensionData.previousRoles) {
      await this.restoreRoles(member, user.suspensionData.previousRoles);
    } else {
      logger.error(`Cannot restore roles for ${user.userId} - no previous roles recorded`);
    }
    
    // Update user status
    user.specialStatus = null;
    user.suspensionData = null;
    await user.save();
    
    // Send DM to user if configured
    if (this.notifyOnExpiration) {
      try {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Suspension Expired')
              .setDescription('Your suspension from the NYRP Staff Team has expired and your roles have been restored.')
              .setTimestamp()
          ]
        });
      } catch (error) {
        logger.warn(`Could not send DM to ${member.user.tag}: ${error.message}`);
      }
    }
    
    // Announce in staff log channel
    try {
      const staffLogChannel = await guild.channels.fetch(channelIds.staffLog);
      
      if (staffLogChannel) {
        await staffLogChannel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Suspension Expired')
              .setDescription(`<@${user.userId}>'s suspension has expired and their roles have been restored automatically.`)
              .setTimestamp()
          ]
        });
      }
    } catch (error) {
      logger.warn(`Could not send announcement to staff log: ${error.message}`);
    }
  }
  
  /**
   * Restore roles to a member after suspension
   * @param {Object} member - The Discord guild member
   * @param {Array} rolesToRestore - Array of role IDs to restore
   * @param {string} infractionId - Optional infraction ID for logging
   */
  async restoreRoles(member, rolesToRestore, infractionId = null) {
    if (!member || !rolesToRestore || !Array.isArray(rolesToRestore)) {
      logger.error('Invalid parameters for restoreRoles');
      return;
    }
    
    logger.info(`Restoring ${rolesToRestore.length} roles for ${member.user.tag} (${member.id})`);
    
    // Create audit log entry
    const logEntry = new AuditLog({
      actionType: 'Suspension_Ended',
      performedBy: {
        userId: this.client.user.id,
        username: this.client.user.username,
        rank: 'Bot'
      },
      targetUser: {
        userId: member.id,
        username: member.user.username
      },
      details: {
        status: 'Automatic',
        rolesToRestore: rolesToRestore,
        completedAt: new Date()
      }
    });
    
    if (infractionId) {
      logEntry.relatedIds = { infractionId };
    }
    
    await logEntry.save();
    
    // Remove Suspended role
    try {
      if (member.roles.cache.has(roleIds.Suspended)) {
        await member.roles.remove(roleIds.Suspended);
        logger.debug(`Removed Suspended role from ${member.user.tag}`);
      }
    } catch (error) {
      logger.error(`Failed to remove Suspended role from ${member.user.tag}: ${error.message}`);
      // Continue anyway to try restoring roles
    }
    
    // Add back previous roles
    let restoredCount = 0;
    for (const roleId of rolesToRestore) {
      try {
        // Skip if role doesn't exist anymore or is a special status role
        if (
          ![roleIds.Suspended, roleIds.Blacklisted, roleIds.UnderInvestigation].includes(roleId) &&
          member.guild.roles.cache.has(roleId)
        ) {
          await member.roles.add(roleId);
          restoredCount++;
        }
      } catch (error) {
        logger.warn(`Could not restore role ${roleId} to ${member.user.tag}: ${error.message}`);
      }
    }
    
    logger.info(`Successfully restored ${restoredCount}/${rolesToRestore.length} roles for ${member.user.tag}`);
  }
}

module.exports = SuspensionChecker;