// src/utils/logger.js
const winston = require('winston');
const { format, transports } = winston;
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...metadata }) => {
    // Extract error stack if present
    let stack = '';
    if (metadata.stack) {
      stack = `\n${metadata.stack}`;
      delete metadata.stack;
    }
    
    // Format metadata
    let metadataStr = '';
    if (Object.keys(metadata).length > 0) {
      metadataStr = JSON.stringify(metadata, null, 2);
    }
    
    return `${timestamp} ${level}: ${message}${metadataStr ? `\n${metadataStr}` : ''}${stack}`;
  })
);

// Custom format for file logs
const fileFormat = format.combine(
  format.timestamp(),
  format.json()
);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Create the logger
const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { service: 'nyrp-staff-bot' },
  transports: [
    // Write all logs to files
    new transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    new transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new transports.File({ 
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new transports.File({ 
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5 
    })
  ]
});

// Add console transport in non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    level: process.env.CONSOLE_LOG_LEVEL || 'debug',
    format: consoleFormat
  }));
}

// Add daily rotation file transport for production
if (process.env.NODE_ENV === 'production') {
  logger.add(new transports.File({
    filename: path.join(logDir, 'daily', `${new Date().toISOString().split('T')[0]}.log`),
    format: fileFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 14 // Keep logs for 14 days
  }));
}

// Extend logger with middleware function for Express
logger.middleware = function() {
  return function(req, res, next) {
    const start = new Date();
    const { ip, method, originalUrl } = req;
    
    res.on('finish', () => {
      const duration = new Date() - start;
      const status = res.statusCode;
      
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'http';
      
      logger.log({
        level,
        message: `${method} ${originalUrl}`,
        status,
        duration,
        ip,
        userAgent: req.get('user-agent') || 'unknown',
        userId: req.user?.id || 'unauthenticated'
      });
    });
    
    next();
  };
};

// Log database operations
logger.dbOperation = function(operation, collection, filter = {}, duration, success = true, error = null) {
  const level = success ? 'debug' : 'error';
  
  logger.log({
    level,
    message: `DB ${operation} ${success ? 'succeeded' : 'failed'} on ${collection}`,
    operation,
    collection,
    filter: JSON.stringify(filter),
    duration,
    error: error ? error.message : null,
    stack: error ? error.stack : null
  });
};

// Override console methods in development to use winston
if (process.env.REDIRECT_CONSOLE === 'true') {
  console.log = (...args) => logger.info.call(logger, ...args);
  console.info = (...args) => logger.info.call(logger, ...args);
  console.warn = (...args) => logger.warn.call(logger, ...args);
  console.error = (...args) => logger.error.call(logger, ...args);
  console.debug = (...args) => logger.debug.call(logger, ...args);
}

module.exports = logger;