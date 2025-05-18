// src/config/config.js - Complete with all required defaults
/**
 * Main configuration file for the NYRP Staff Management Bot
 */
const { roleIds } = require('./roles');
const { channelIds } = require('./channels');

const config = {
  // Bot settings
  prefix: '!',  // Legacy prefix for any non-slash commands (if needed)
  defaultCooldown: 3, // Default cooldown in seconds
  
  // Infraction system settings
  infractionSettings: {
    requireApprovalFrom: [
      roleIds.AssistantDirector,
      roleIds.LeadAssistantDirector,
      roleIds.ViceDeputyDirector,
      roleIds.DeputyDirector,
      roleIds.Director
    ],
    autoRemoveRolesOnSuspension: true,
    suspensionDurations: {
      '24h': 86400000, // 24 hours in ms
      '48h': 172800000,
      '72h': 259200000,
      '1w': 604800000,  // 1 week in ms
      '2w': 1209600000  // 2 weeks in ms
    },
    checkExpirationInterval: 300000, // Check for expired suspensions every 5 minutes
    notifyOnExpiration: true,
    appealWaitingPeriod: 86400000 // 24 hours waiting period before appeals
  },
  
  // Promotion system settings
  promotionSettings: {
    requireReason: true,
    minReasonLength: 10,
    announcePromotions: true,
    dmPromotedUsers: true,
    allowSkipRanks: false // Whether to allow skipping ranks in promotions
  },
  
  // Ticket system settings
  ticketSettings: {
    autoCloseAfterHours: 72, // Auto-close tickets after 72 hours of inactivity
    reminderAfterHours: 24,  // Send reminder after 24 hours of inactivity
    deleteClosedAfterHours: 24, // Delete closed ticket channels after 24 hours
    maxActivePerUser: 1,     // Maximum active tickets per user
    transcriptGenerationEnabled: true, // Whether to automatically generate transcripts on close
    transcriptFormat: 'html', // Format for ticket transcripts
    categorizedTranscripts: true // Whether to store transcripts in different channels based on category
  },
  
  // Internal Affairs office settings
  officeSettings: {
    nameFormat: 'ia-case-{targetUsername}-{caseNumber}',
    autoTranscriptOnClose: true,
    retentionOptions: ['Keep', 'Delete After 24h', 'Delete Immediately'],
    defaultRetentionOption: 'Keep',
    outcomeOptions: [
      'No Action Required',
      'Warning Issued',
      'Infraction Created',
      'Case Dismissed',
      'Referred to Higher Authority'
    ],
    transcriptIncludeEvidence: true // Whether to include evidence links in transcripts
  },
  
  // Web dashboard integration
  dashboardSettings: {
    enabled: true,
    apiPort: process.env.API_PORT || 3000,
    sessionExpirationDays: 7,
    requiredRoleForAccess: roleIds.TrialModerator, // Minimum role required to access dashboard
    endpoints: {
      auth: '/api/auth',
      staff: '/api/staff',
      infractions: '/api/infractions',
      promotions: '/api/promotions',
      tickets: '/api/tickets',
      offices: '/api/offices',
      statistics: '/api/statistics',
      logs: '/api/logs'
    },
    accessLevels: {
      [roleIds.TrialModerator]: 'moderator',
      [roleIds.TrialAdministrator]: 'administrator',
      [roleIds.TrialInternalAffairs]: 'internal_affairs',
      [roleIds.TrialStaffOverseer]: 'supervisor',
      [roleIds.TrialManager]: 'manager',
      [roleIds.AssistantDirector]: 'director'
    }
  },
  
  // Error handling and logging
  errorHandling: {
    logErrors: true,
    logWarnings: true,
    reportDetailLevel: 'full', // 'minimal', 'standard', or 'full'
    monitoringEnabled: process.env.MONITORING_ENABLED === 'true',
    interactionHandling: {
      retryOnFailure: true, 
      maxRetries: 2,
      handleInteractionAlreadyReplied: true
    }
  },
  
  // Database settings
  database: {
    connectionString: process.env.MONGODB_URI,
    maxConnectionAttempts: 5,
    autoReconnect: true,
    collectionPrefix: 'nyrp_',
    backupSchedule: '0 0 * * *', // Daily backup at midnight (cron format)
    performMaintenance: true,
    maintenanceSchedule: '0 3 * * 0' // Weekly maintenance on Sunday at 3 AM
  }
};

// Export the config
module.exports = config;