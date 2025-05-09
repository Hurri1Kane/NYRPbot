// src/database/models/Infraction.js
const mongoose = require('mongoose');

const InfractionSchema = new mongoose.Schema({
  targetUserId: {
    type: String,
    required: true,
    index: true
  },
  targetUsername: {
    type: String,
    required: true
  },
  issuerUserId: {
    type: String,
    required: true,
    index: true
  },
  issuerUsername: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Warning', 'Suspension', 'Demotion', 'Termination', 'Blacklist', 'Under Investigation'],
    index: true
  },
  reason: {
    type: String,
    required: true
  },
  evidence: [String], // Array of evidence links or descriptions
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Approved', 'Denied', 'Completed', 'Expired', 'Appealed'],
    default: 'Pending',
    index: true
  },
  appealable: {
    type: Boolean,
    default: false
  },
  approvalData: {
    approvedBy: String,
    approvedByUsername: String,
    approvedAt: Date,
    notes: String
  },
  denialData: {
    deniedBy: String,
    deniedByUsername: String,
    deniedAt: Date,
    reason: String
  },
  suspensionData: {
    duration: String, // "24h", "48h", "72h", "1w", "2w"
    startedAt: Date,
    expiresAt: Date
  },
  demotionData: {
    previousRank: String,
    newRank: String
  },
  auditLogId: String,
  appealData: {
    appealedAt: Date,
    appealReason: String,
    appealStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Denied']
    },
    handledBy: String,
    handledAt: Date,
    notes: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
InfractionSchema.index({ createdAt: -1 });
InfractionSchema.index({ type: 1, status: 1 });
InfractionSchema.index({ 'suspensionData.expiresAt': 1, status: 1 });

const Infraction = mongoose.model('Infraction', InfractionSchema);
module.exports = Infraction;