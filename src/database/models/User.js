// src/database/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  discriminator: String,
  currentRank: {
    type: String,
    required: true,
    enum: [
      'Trial Moderator', 'Moderator', 'Senior Moderator', 'Head Moderator',
      'Trial Administrator', 'Administrator', 'Senior Administrator', 'Head Administrator',
      'Trial Internal Affairs', 'Internal Affairs', 'Internal Affairs Director',
      'Staff Supervisor in Training', 'Staff Supervisor', 'Lead Staff Supervisor',
      'Trial Manager', 'Manager', 'Senior Manager',
      'Assistant Director', 'Lead Assistant Director', 'Vice Deputy Director', 'Deputy Director', 'Director'
    ]
  },
  rankId: {
    type: String,
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  specialStatus: {
    type: String,
    enum: [null, 'Under Investigation', 'Suspended', 'Blacklisted'],
    default: null
  },
  suspensionData: {
    expiresAt: Date,
    previousRoles: [String]
  },
  previousRanks: [{
    rank: String,
    rankId: String,
    from: Date,
    to: Date,
    promotedBy: String,
    reason: String
  }],
  categoryRoles: [String],
  staffStatistics: {
    ticketsHandled: {
      type: Number,
      default: 0
    },
    infractions: {
      issued: {
        type: Number,
        default: 0
      },
      received: {
        type: Number,
        default: 0
      }
    },
    officesCreated: {
      type: Number,
      default: 0
    }
  },
  lastActive: Date
}, {
  timestamps: true
});

// Indexes for efficient queries
UserSchema.index({ currentRank: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ specialStatus: 1 });
UserSchema.index({ 'suspensionData.expiresAt': 1 });

const User = mongoose.model('User', UserSchema);
module.exports = User;