// src/database/models/Promotion.js
const mongoose = require('mongoose');

const PromotionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  promotedBy: {
    type: String,
    required: true
  },
  promotedByUsername: {
    type: String,
    required: true
  },
  previousRank: {
    type: String,
    required: true
  },
  previousRankId: {
    type: String,
    required: true
  },
  newRank: {
    type: String,
    required: true
  },
  newRankId: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  announcementMessageId: String,
  auditLogId: String
}, {
  timestamps: true
});

// Indexes for efficient queries
PromotionSchema.index({ createdAt: -1 });
PromotionSchema.index({ userId: 1, createdAt: -1 });

const Promotion = mongoose.model('Promotion', PromotionSchema);
module.exports = Promotion;