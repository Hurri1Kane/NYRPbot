// src/utils/errorHandler.js
const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

/**
 * Comprehensive error handling system for Discord interactions
 */
class ErrorHandler {
  /**
   * Create reusable error response
   * @param {Error} error - The error that occurred
   * @param {string} context - Where the error occurred
   * @returns {EmbedBuilder} - Error embed for Discord response
   */
  static createErrorEmbed(error, context) {
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Error Occurred')
      .setDescription(`There was an error processing your request.`)
      .addFields(
        { name: 'Context', value: context || 'Unknown context', inline: true },
        { name: 'Error ID', value: generateErrorId(), inline: true }
      )
      .setFooter({ text: 'Contact a developer with this Error ID if the issue persists' })
      .setTimestamp();
  }

  /**
   * Main error handling function for interaction commands
   * @param {Error} error - The error that occurred
   * @param {Object} interaction - Discord interaction object
   * @param {string} context - Where the error occurred
   */
  static async handleInteractionError(error, interaction, context) {
    const errorId = generateErrorId();
    
    // Log detailed error information
    logger.error({
      errorId,
      message: error.message,
      stack: error.stack,
      context,
      interactionId: interaction.id,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      commandName: interaction.commandName,
      timestamp: new Date().toISOString()
    });

    // Check if interaction has already been replied to
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [this.createErrorEmbed(error, context)],
          ephemeral: true
        }).catch(followUpError => {
          // If edit fails, try to follow up
          logger.error(`Failed to edit reply: ${followUpError.message}`);
          interaction.followUp({
            embeds: [this.createErrorEmbed(error, context)],
            ephemeral: true
          }).catch(finalError => {
            logger.error(`Failed to send any error response: ${finalError.message}`);
          });
        });
      } else {
        await interaction.reply({
          embeds: [this.createErrorEmbed(error, context)],
          ephemeral: true
        }).catch(replyError => {
          logger.error(`Failed to send initial reply: ${replyError.message}`);
          // Interaction may have expired - nothing more we can do here
        });
      }
    } catch (responseError) {
      logger.error(`Critical error in error handler: ${responseError.message}`);
      // At this point, we've done all we can to notify the user
    }

    // Report error to monitoring system, if configured
    if (process.env.MONITORING_ENABLED === 'true') {
      reportToMonitoring(error, errorId, context, interaction);
    }

    return errorId;
  }

  /**
   * Process API request errors for web dashboard
   * @param {Error} error - The error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static handleApiError(error, req, res) {
    const errorId = generateErrorId();
    
    logger.error({
      errorId,
      message: error.message,
      stack: error.stack,
      endpoint: req.originalUrl,
      method: req.method,
      userId: req.user?.id || 'unauthenticated',
      timestamp: new Date().toISOString()
    });

    // Send appropriate error response based on error type
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details || error.message,
        errorId
      });
    } else if (error.name === 'AuthorizationError') {
      return res.status(403).json({
        error: 'Not Authorized',
        errorId
      });
    } else if (error.name === 'NotFoundError') {
      return res.status(404).json({
        error: 'Not Found',
        details: error.message,
        errorId
      });
    }

    // Default server error
    res.status(500).json({
      error: 'Internal Server Error',
      errorId
    });

    // Report to monitoring
    if (process.env.MONITORING_ENABLED === 'true') {
      reportToMonitoring(error, errorId, req.originalUrl, { userId: req.user?.id });
    }

    return errorId;
  }

  /**
   * Handle background task errors that aren't tied to interactions
   * @param {Error} error - The error object
   * @param {string} context - Task context
   */
  static handleBackgroundError(error, context) {
    const errorId = generateErrorId();
    
    logger.error({
      errorId,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });

    // Report to monitoring
    if (process.env.MONITORING_ENABLED === 'true') {
      reportToMonitoring(error, errorId, context);
    }

    return errorId;
  }

  /**
   * Handle database operation errors
   * @param {Error} error - The error object
   * @param {string} operation - Database operation being performed
   * @param {string} model - Database model name
   */
  static handleDatabaseError(error, operation, model) {
    const errorId = generateErrorId();
    
    logger.error({
      errorId,
      message: error.message,
      stack: error.stack,
      database: {
        operation,
        model,
        query: error.query || 'Unknown query'
      },
      timestamp: new Date().toISOString()
    });

    // Report to monitoring
    if (process.env.MONITORING_ENABLED === 'true') {
      reportToMonitoring(error, errorId, `DB:${model}:${operation}`);
    }

    return errorId;
  }
}

/**
 * Generate a unique ID for error tracking
 * @returns {string} Unique error ID
 */
function generateErrorId() {
  return `ERR-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
}

/**
 * Report error to external monitoring system
 * This function would integrate with your preferred monitoring 
 * service like Sentry, New Relic, etc.
 */
function reportToMonitoring(error, errorId, context, metadata = {}) {
  // Implement your monitoring system integration here
  // Example if using Sentry:
  // Sentry.captureException(error, {
  //   tags: { errorId, context },
  //   extra: metadata
  // });
  
  // For now, we'll just log it
  logger.info(`Error ${errorId} reported to monitoring system`);
}

module.exports = ErrorHandler;