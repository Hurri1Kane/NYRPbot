// src/database/models/Ticket.js
const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  creator: {
    userId: {
      type: String,
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true
    }
  },
  category: {
    type: String,
    required: true,
    enum: ['General Support', 'In-Game Reports', 'Staff Reports'],
    index: true
  },
  subject: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium',
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Open', 'Closed'],
    default: 'Open',
    index: true
  },
  claimedBy: {
    userId: String,
    username: String,
    claimedAt: Date
  },
  participants: [{
    userId: String,
    username: String,
    addedBy: String,
    addedAt: Date
  }],
  staffReport: {
    isStaffReport: {
      type: Boolean,
      default: false
    },
    reportedStaffId: String,
    reportedStaffRank: String,
    elevatedTo: String,
    originallyVisibleTo: [String]
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  closedBy: {
    userId: String,
    username: String,
    closedAt: Date,
    reason: String
  },
  transcriptUrl: String,
  autoCloseWarningIssued: {
    type: Boolean,
    default: false
  },
  messageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
TicketSchema.index({ status: 1, lastActivity: 1 });
TicketSchema.index({ 'creator.userId': 1, status: 1 });
TicketSchema.index({ 'claimedBy.userId': 1, status: 1 });

// Pre-save hook to generate ticket ID if not provided
TicketSchema.pre('save', async function(next) {
  try {
    // Only generate ID for new tickets
    if (this.isNew && !this.ticketId) {
      // Find the highest current ticket ID
      const latestTicket = await this.constructor.findOne({})
        .sort({ ticketId: -1 })
        .lean();
      
      let nextId = 1000; // Start at 1000 if no tickets exist
      
      if (latestTicket && latestTicket.ticketId) {
        // Extract the number from the ticket ID (format: TICKET-1234)
        const match = latestTicket.ticketId.match(/TICKET-(\d+)/);
        if (match && match[1]) {
          nextId = parseInt(match[1], 10) + 1;
        }
      }
      
      this.ticketId = `TICKET-${nextId}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Method to update activity timestamp
TicketSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Method to increment message count
TicketSchema.methods.incrementMessageCount = function() {
  this.messageCount += 1;
  return this.save();
};

// Statics for common queries
TicketSchema.statics.findActiveTickets = function(userId) {
  return this.find({ 
    'creator.userId': userId,
    status: 'Open'
  });
};

TicketSchema.statics.findStaffReports = function() {
  return this.find({ 
    'staffReport.isStaffReport': true,
    status: 'Open'
  });
};

TicketSchema.statics.findClaimedTickets = function(staffId) {
  return this.find({ 
    'claimedBy.userId': staffId,
    status: 'Open'
  });
};

TicketSchema.statics.findInactiveTickets = function(thresholdHours) {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - thresholdHours);
  
  return this.find({
    status: 'Open',
    lastActivity: { $lt: threshold }
  });
};

const Ticket = mongoose.model('Ticket', TicketSchema);
module.exports = Ticket;