// src/index.js
require('dotenv').config();
const express = require('express');
const { client, loadCommands, registerEvents } = require('./discord/client');
const connectDatabase = require('./database/connect');
const logger = require('./utils/logger');
const ErrorHandler = require('./utils/errorHandler');
const SuspensionChecker = require('./discord/utils/suspensionChecker');
const { deployCommands } = require('./discord/utils/deployCommands');
const { createBackgroundTasks } = require('./discord/utils/backgroundTasks');

// === EXPRESS SETUP FOR RENDER ===
const app = express();
const port = process.env.PORT || 4000;

// Optional basic route for health check or ping
app.get('/', (req, res) => {
  res.send('Bot backend is running');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Web service listening on port ${port}`);
});

// === DISCORD + DATABASE SETUP ===
connectDatabase()
  .then(() => {
    logger.info('Connected to database');
    return client.login(process.env.TOKEN);
  })
  .then(() => {
    loadCommands();
    registerEvents();
    deployCommands();

    // Store global instances
    global.suspensionChecker = new SuspensionChecker(client);
    global.backgroundTasks = createBackgroundTasks(client);

    logger.info('Bot is up and running');
  })
  .catch(err => {
    ErrorHandler.handleFatalError(err);
  });

/**
 * Initialize the bot
 */
async function init() {
  try {
    logger.info('Starting NYRP Staff Management Bot...');
    
    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    logger.info('Database connection established.');
    
    // Load commands and register events
    logger.info('Loading commands and event handlers...');
    await loadCommands();
    await registerEvents();
    
    // Log in to Discord
    logger.info('Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    
    // Deploy commands if in development mode or forced
    if (process.env.NODE_ENV === 'development' || process.env.FORCE_DEPLOY_COMMANDS === 'true') {
      logger.info('Deploying slash commands...');
      await deployCommands();
      logger.info('Slash commands deployed successfully.');
    }
    
    // Start suspension checker
    logger.info('Starting suspension expiration checker...');
    suspensionChecker = new SuspensionChecker(client);
    suspensionChecker.start();
    
    // Start background tasks
    logger.info('Starting background tasks...');
    backgroundTasks = createBackgroundTasks(client);
    backgroundTasks.startAll();
    
    logger.info('Bot initialization complete!');
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(error, 'Bot Initialization');
    logger.error(`Failed to initialize bot: ${error.message} (Error ID: ${errorId})`);
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
function shutdown() {
  logger.info('Shutting down...');
  
  // Stop background tasks
  if (backgroundTasks) {
    logger.info('Stopping background tasks...');
    backgroundTasks.stopAll();
  }
  
  // Stop suspension checker
  if (suspensionChecker) {
    logger.info('Stopping suspension checker...');
    suspensionChecker.stop();
  }
  
  // Destroy client
  if (client) {
    logger.info('Disconnecting from Discord...');
    client.destroy();
  }
  
  logger.info('Shutdown complete. Goodbye!');
  process.exit(0);
}

// Handle process events
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  const errorId = ErrorHandler.handleBackgroundError(error, 'Uncaught Exception');
  logger.error(`Uncaught exception: ${error.message} (Error ID: ${errorId})`);
  logger.error(error.stack);
  
  // If this is a critical error, shut down
  if (error.message.includes('TOKEN') || error.message.includes('DISALLOWED_INTENTS')) {
    logger.error('Critical error detected, shutting down...');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const errorId = ErrorHandler.handleBackgroundError(
    reason instanceof Error ? reason : new Error(String(reason)),
    'Unhandled Rejection'
  );
  logger.error(`Unhandled rejection at ${promise}: ${reason} (Error ID: ${errorId})`);
  
  // Log stack trace if available
  if (reason instanceof Error && reason.stack) {
    logger.error(reason.stack);
  }
});

// Initialize the bot
init();