// src/discord/utils/backgroundTasks.js
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/errorHandler');
const config = require('../../config/config');
const Infraction = require('../../database/models/Infraction');
const User = require('../../database/models/User');
const Ticket = require('../../database/models/Ticket');
const Office = require('../../database/models/Office');
const { channelIds } = require('../../config/channels');

/**
 * Background task manager
 * Handles all periodic tasks that need to be executed at intervals
 */
class BackgroundTaskManager {
  constructor(client) {
    this.client = client;
    this.tasks = new Map();
    this.isRunning = false;
  }
  
  /**
   * Register a new background task
   * @param {string} name - Task name
   * @param {function} task - Task function to execute
   * @param {number} interval - Interval in milliseconds between task runs
   * @param {boolean} runImmediately - Whether to run the task immediately on start
   */
  registerTask(name, task, interval, runImmediately = false) {
    if (this.tasks.has(name)) {
      throw new Error(`Task '${name}' is already registered`);
    }
    
    this.tasks.set(name, {
      name,
      task,
      interval,
      timerId: null,
      lastRun: null,
      isRunning: false,
      runImmediately,
      errors: 0
    });
    
    logger.info(`Registered background task: ${name} (${interval}ms interval)`);
    
    return this;
  }
  
  /**
   * Start all registered tasks
   */
  startAll() {
    if (this.isRunning) {
      logger.warn('Background tasks are already running');
      return;
    }
    
    for (const [name, taskInfo] of this.tasks.entries()) {
      this.startTask(name);
    }
    
    this.isRunning = true;
    logger.info(`Started ${this.tasks.size} background tasks`);
  }
  
  /**
   * Stop all registered tasks
   */
  stopAll() {
    if (!this.isRunning) {
      logger.warn('Background tasks are not running');
      return;
    }
    
    for (const [name, taskInfo] of this.tasks.entries()) {
      this.stopTask(name);
    }
    
    this.isRunning = false;
    logger.info('Stopped all background tasks');
  }
  
  /**
   * Start a specific task
   * @param {string} name - Task name
   */
  startTask(name) {
    const taskInfo = this.tasks.get(name);
    
    if (!taskInfo) {
      throw new Error(`Task '${name}' is not registered`);
    }
    
    if (taskInfo.timerId) {
      logger.warn(`Task '${name}' is already running`);
      return;
    }
    
    // Run immediately if configured
    if (taskInfo.runImmediately) {
      this.runTask(name).catch(error => {
        const errorId = ErrorHandler.handleBackgroundError(
          error, 
          `BackgroundTask:${name}:immediate`
        );
        logger.error(`Error in immediate execution of task '${name}': ${error.message} (Error ID: ${errorId})`);
      });
    }
    
    // Schedule regular runs
    taskInfo.timerId = setInterval(() => {
      this.runTask(name).catch(error => {
        const errorId = ErrorHandler.handleBackgroundError(
          error, 
          `BackgroundTask:${name}:scheduled`
        );
        logger.error(`Error in scheduled execution of task '${name}': ${error.message} (Error ID: ${errorId})`);
        
        // Track consecutive errors
        taskInfo.errors++;
        
        // If a task fails too many times, pause it
        if (taskInfo.errors >= 5) {
          logger.warn(`Task '${name}' has failed ${taskInfo.errors} times in a row, pausing execution`);
          this.stopTask(name);
        }
      });
    }, taskInfo.interval);
    
    logger.info(`Started task: ${name}`);
  }
  
  /**
   * Stop a specific task
   * @param {string} name - Task name
   */
  stopTask(name) {
    const taskInfo = this.tasks.get(name);
    
    if (!taskInfo) {
      throw new Error(`Task '${name}' is not registered`);
    }
    
    if (taskInfo.timerId) {
      clearInterval(taskInfo.timerId);
      taskInfo.timerId = null;
      logger.info(`Stopped task: ${name}`);
    }
  }
  
  /**
   * Execute a task
   * @param {string} name - Task name
   */
  async runTask(name) {
    const taskInfo = this.tasks.get(name);
    
    if (!taskInfo) {
      throw new Error(`Task '${name}' is not registered`);
    }
    
    // Skip if task is already running
    if (taskInfo.isRunning) {
      logger.debug(`Task '${name}' is already running, skipping`);
      return;
    }
    
    // Mark task as running
    taskInfo.isRunning = true;
    
    try {
      const startTime = Date.now();
      logger.debug(`Running task: ${name}`);
      
      // Run the task
      await taskInfo.task();
      
      // Update last run time
      taskInfo.lastRun = new Date();
      
      // Reset error counter on successful run
      taskInfo.errors = 0;
      
      const executionTime = Date.now() - startTime;
      logger.debug(`Task '${name}' completed in ${executionTime}ms`);
    } catch (error) {
      throw error; // Will be caught by caller
    } finally {
      // Always mark task as not running
      taskInfo.isRunning = false;
    }
  }
}

/**
 * Create and configure the background task manager
 * @param {Client} client - Discord.js client
 * @returns {BackgroundTaskManager} Configured task manager
 */
function createBackgroundTasks(client) {
  const taskManager = new BackgroundTaskManager(client);
  
  // Register ticket activity check task
  taskManager.registerTask(
    'ticketActivityCheck',
    async () => {
      const now = new Date();
      const guild = client.guilds.cache.first();
      
      if (!guild) {
        logger.warn('No guild available for ticket activity check');
        return;
      }
      
      // Find inactive tickets that need a reminder
      const reminderThreshold = new Date(now.getTime() - (config.ticketSettings.reminderAfterHours * 3600000));
      const ticketsNeedingReminder = await Ticket.find({
        status: 'Open',
        lastActivity: { $lt: reminderThreshold },
        autoCloseWarningIssued: false
      });
      
      // Send reminders
      for (const ticket of ticketsNeedingReminder) {
        try {
          const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
          
          if (channel) {
            await channel.send({
              content: `⚠️ **Inactivity Warning** ⚠️\n\nThis ticket has been inactive for ${config.ticketSettings.reminderAfterHours} hours. It will be automatically closed in ${config.ticketSettings.autoCloseAfterHours - config.ticketSettings.reminderAfterHours} hours if there is no further activity.`
            });
            
            // Update the ticket
            ticket.autoCloseWarningIssued = true;
            await ticket.save();
            
            logger.info(`Sent inactivity reminder for ticket ${ticket.ticketId} in channel ${channel.name}`);
          }
        } catch (error) {
          const errorId = ErrorHandler.handleBackgroundError(error, `TicketReminder:${ticket.ticketId}`);
          logger.error(`Failed to send reminder for ticket ${ticket.ticketId}: ${error.message} (Error ID: ${errorId})`);
        }
      }
      
      // Find inactive tickets that need to be closed
      const closeThreshold = new Date(now.getTime() - (config.ticketSettings.autoCloseAfterHours * 3600000));
      const ticketsToClose = await Ticket.find({
        status: 'Open',
        lastActivity: { $lt: closeThreshold }
      });
      
      // Close inactive tickets
      for (const ticket of ticketsToClose) {
        try {
          const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
          
          if (channel) {
            // Generate transcript if enabled
            let transcriptUrl = null;
            if (config.ticketSettings.transcriptGenerationEnabled) {
              // This would call a transcript generation function
              // transcriptUrl = await generateTranscript(channel, ticket);
              transcriptUrl = "Auto-close transcript not yet implemented";
            }
            
            // Send close message
            await channel.send({
              content: `🔒 **Ticket Auto-Closed** 🔒\n\nThis ticket has been automatically closed due to ${config.ticketSettings.autoCloseAfterHours} hours of inactivity.`
            });
            
            // Update the ticket
            ticket.status = 'Closed';
            ticket.closedBy = {
              userId: client.user.id,
              username: client.user.username,
              closedAt: now,
              reason: `Automatically closed after ${config.ticketSettings.autoCloseAfterHours} hours of inactivity`
            };
            ticket.transcriptUrl = transcriptUrl;
            await ticket.save();
            
            logger.info(`Auto-closed ticket ${ticket.ticketId} in channel ${channel.name}`);
            
            // Schedule channel for deletion if configured
            if (config.ticketSettings.deleteClosedAfterHours > 0) {
              setTimeout(async () => {
                try {
                  // Double-check the channel still exists
                  const channelToDelete = await guild.channels.fetch(ticket.channelId).catch(() => null);
                  if (channelToDelete) {
                    await channelToDelete.delete(`Ticket auto-deleted after ${config.ticketSettings.deleteClosedAfterHours} hours of being closed`);
                    logger.info(`Auto-deleted ticket channel for ${ticket.ticketId}`);
                  }
                } catch (deleteError) {
                  const errorId = ErrorHandler.handleBackgroundError(deleteError, `TicketDelete:${ticket.ticketId}`);
                  logger.error(`Failed to delete ticket channel ${ticket.channelId}: ${deleteError.message} (Error ID: ${errorId})`);
                }
              }, config.ticketSettings.deleteClosedAfterHours * 3600000);
            }
          }
        } catch (error) {
          const errorId = ErrorHandler.handleBackgroundError(error, `TicketAutoClose:${ticket.ticketId}`);
          logger.error(`Failed to auto-close ticket ${ticket.ticketId}: ${error.message} (Error ID: ${errorId})`);
        }
      }
    },
    30 * 60000 // Check every 30 minutes
  );
  
  // Register office cleanup task
  taskManager.registerTask(
    'officeCleanup',
    async () => {
      const now = new Date();
      const guild = client.guilds.cache.first();
      
      if (!guild) {
        logger.warn('No guild available for office cleanup');
        return;
      }
      
      // Find closed offices scheduled for deletion
      const officesToDelete = await Office.find({
        status: 'Closed',
        channelRetention: 'Delete After 24h',
        scheduledDeletion: { $lt: now }
      });
      
      // Delete office channels
      for (const office of officesToDelete) {
        try {
          const channel = await guild.channels.fetch(office.channelId).catch(() => null);
          
          if (channel) {
            await channel.delete(`Scheduled deletion after office closure`);
            logger.info(`Deleted office channel for case ${office.officeId}`);
            
            // Update office record to mark channel as deleted
            office.channelDeleted = true;
            await office.save();
          } else {
            // If channel doesn't exist, still mark as deleted
            office.channelDeleted = true;
            await office.save();
          }
        } catch (error) {
          const errorId = ErrorHandler.handleBackgroundError(error, `OfficeDelete:${office.officeId}`);
          logger.error(`Failed to delete office channel ${office.channelId}: ${error.message} (Error ID: ${errorId})`);
        }
      }
    },
    60 * 60000 // Check every 60 minutes
  );
  
  // Register database maintenance task
  if (config.database.performMaintenance) {
    taskManager.registerTask(
      'databaseMaintenance',
      async () => {
        const startTime = Date.now();
        logger.info('Starting database maintenance...');
        
        // Perform maintenance tasks here, like:
        // - Cleanup old logs
        // - Archive old records
        // - Run aggregation for statistics
        
        const endTime = Date.now();
        logger.info(`Database maintenance completed in ${endTime - startTime}ms`);
      },
      24 * 60 * 60000 // Run once per day
    );
  }
  
  return taskManager;
}

module.exports = { createBackgroundTasks };