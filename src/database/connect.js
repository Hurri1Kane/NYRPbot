// src/database/connect.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');
const config = require('../config/config');

// Connection state tracking
let connectionAttempts = 0;
let isConnected = false;
let reconnectTimer = null;

/**
 * Connect to MongoDB
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
async function connectDatabase() {
  // Reset connection attempts if this is a fresh connection
  if (!isConnected) {
    connectionAttempts = 0;
  }
  
  // Increment connection attempts counter
  connectionAttempts++;
  
  // Check if we've exceeded max attempts
  const maxAttempts = config.database.maxConnectionAttempts || 5;
  if (connectionAttempts > maxAttempts) {
    const error = new Error(`Failed to connect to MongoDB after ${maxAttempts} attempts`);
    const errorId = ErrorHandler.handleBackgroundError(error, 'Database Connection');
    logger.error(`Database connection failed: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
  
  try {
    // Configure mongoose
    mongoose.set('strictQuery', true);
    
    // Set up connection options
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10
    };
    
    // Log connection attempt
    logger.info(`Connecting to MongoDB (Attempt ${connectionAttempts}/${maxAttempts})...`);
    
    // Connect to MongoDB
    await mongoose.connect(config.database.connectionString, options);
    
    // Reset connection attempts on successful connection
    connectionAttempts = 0;
    isConnected = true;
    
    logger.info('Successfully connected to MongoDB');
    
    // Set up event listeners for the connection
    setupConnectionListeners(mongoose.connection);
    
    return mongoose.connection;
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(error, 'Database Connection');
    logger.error(`Failed to connect to MongoDB: ${error.message} (Error ID: ${errorId})`);
    
    // Retry connection after delay if auto-reconnect is enabled
    if (config.database.autoReconnect) {
      const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 60000); // Exponential backoff, max 60 seconds
      
      logger.info(`Retrying connection in ${delay / 1000} seconds...`);
      
      // Clear any existing timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
      // Set up new timer
      reconnectTimer = setTimeout(() => {
        connectDatabase().catch(() => {
          // Error is already logged in the catch block above
        });
      }, delay);
    }
    
    // Rethrow the error for the caller to handle
    throw error;
  }
}

/**
 * Setup event listeners for the database connection
 * @param {mongoose.Connection} connection - Mongoose connection
 */
function setupConnectionListeners(connection) {
  // Handle connection errors
  connection.on('error', (error) => {
    isConnected = false;
    const errorId = ErrorHandler.handleBackgroundError(error, 'Database Connection Error');
    logger.error(`MongoDB connection error: ${error.message} (Error ID: ${errorId})`);
    
    // Attempt reconnection if enabled
    if (config.database.autoReconnect) {
      // Only attempt reconnect if we're not already trying
      if (!reconnectTimer) {
        const delay = 5000; // 5 seconds
        logger.info(`Attempting to reconnect in ${delay / 1000} seconds...`);
        
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectDatabase().catch(() => {
            // Error is already logged in the connectDatabase catch block
          });
        }, delay);
      }
    }
  });
  
  // Log when connection is disconnected
  connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB connection disconnected');
  });
  
  // Log when connection is reconnected
  connection.on('reconnected', () => {
    isConnected = true;
    logger.info('MongoDB connection reestablished');
    
    // Reset connection attempts on successful reconnection
    connectionAttempts = 0;
  });
  
  // Log when connection is closed
  connection.on('close', () => {
    isConnected = false;
    logger.info('MongoDB connection closed');
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    if (connection) {
      connection.close(() => {
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      });
    }
  });
}

/**
 * Check if database connection is established
 * @returns {boolean} Connection status
 */
function isConnectedToDatabase() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDatabase() {
  if (mongoose.connection) {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  }
}

module.exports = connectDatabase;
module.exports.isConnected = isConnectedToDatabase;
module.exports.disconnect = disconnectDatabase;