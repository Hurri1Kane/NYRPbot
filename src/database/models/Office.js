// src/database/models/Office.js
const mongoose = require('mongoose');

const OfficeSchema = new mongoose.Schema({
  officeId: {
    type: String,
    required: true,
    unique: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  targetUser: {
    userId: {
      type: String,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true
    },
    rank: String
  },
  createdBy: {
    userId: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    rank: String
  },
  reason: {
    type: String,
    required: true
  },
  evidence: [String],
  participants: [{
    userId: String,
    username: String,
    rank: String,
    addedBy: String,
    addedAt: Date
  }],
  status: {
    type: String,
    required: true,
    enum: ['Open', 'Closed'],
    default: 'Open',
    index: true
  },
  outcome: {
    type: String,
    enum: [
      null, 
      'No Action Required',
      'Warning Issued',
      'Infraction Created',
      'Case Dismissed',
      'Referred to Higher Authority'
    ],
    default: null
  },
  infractionId: String, // Reference to created infraction if applicable
  closedBy: {
    userId: String,
    username: String,
    rank: String,
    closedAt: Date,
    notes: String
  },
  transcriptUrl: String,
  lastActivity: {
    type: Date,
    default: Date.now
  },
  channelRetention: {
    type: String,
    enum: ['Keep', 'Delete After 24h', 'Delete Immediately'],
    default: 'Keep'
  },
  scheduledDeletion: Date
}, {
  timestamps: true
});

// Indexes for efficient queries
OfficeSchema.index({ status: 1 });
OfficeSchema.index({ 'targetUser.userId': 1 });
OfficeSchema.index({ createdAt: -1 });
OfficeSchema.index({ scheduledDeletion: 1 });

const Office = mongoose.model('Office', OfficeSchema);
module.exports = Office;
