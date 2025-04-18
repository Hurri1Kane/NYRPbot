// src/database/models/WebDashboardSession.js
const mongoose = require('mongoose');

const WebDashboardSessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionToken: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  ipAddress: String,
  userAgent: String,
  permissions: [String],
  accessLevel: {
    type: String,
    required: true,
    enum: ['Moderator', 'Administrator', 'Internal Affairs', 'Supervisor', 'Manager', 'Director', 'Developer']
  }
});

// TTL index for automatic session cleanup
WebDashboardSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const WebDashboardSession = mongoose.model('WebDashboardSession', WebDashboardSessionSchema);
module.exports = WebDashboardSession;