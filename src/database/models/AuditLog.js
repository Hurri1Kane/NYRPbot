// src/database/models/AuditLog.js
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actionType: {
    type: String,
    required: true,
    enum: [
      'Infraction_Created',
      'Infraction_Approved',
      'Infraction_Denied',
      'Infraction_Expired',
      'Infraction_Appealed',
      'Promotion_Executed',
      'Roles_Updated',
      'Suspension_Started',
      'Suspension_Ended',
      'Office_Created',
      'Office_Closed',
      'Ticket_Created',
      'Ticket_Claimed',
      'Ticket_Closed',
      'Ticket_Deleted',
      'System_Error'
    ],
    index: true
  },
  performedBy: {
    userId: {
      type: String,
      required: true,
      index: true
    },
    username: String,
    rank: String
  },
  targetUser: {
    userId: String,
    username: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: mongoose.Schema.Types.Mixed,
  relatedIds: {
    infractionId: String,
    promotionId: String,
    ticketId: String,
    officeId: String,
    errorId: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actionType: 1, createdAt: -1 });
AuditLogSchema.index({ 'targetUser.userId': 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
module.exports = AuditLog;