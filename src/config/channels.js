// src/config/channels.js
/**
 * Channel IDs configuration for the NYRP Staff Management Bot
 * These IDs are referenced throughout the application
 */
const channelIds = {
    // Administrative Channels
    infractionApproval: '1358031305463304302',
    staffLog: '1357029741021892748',
    infractionPromotionAnnouncement: '1357029740094951513',
    
    // Ticket Categories
    ticketCategories: {
        generalSupport: '1361439094391177336',    // General Support category
        staffReport: '1361678114891239520',       // Staff Report category
        inGameReport: '1361678031017476197',      // In-game Report category
        ownershipSupport: '1373059250544181288'   // Ownership Support category
    },
    
    // Ticket Transcript Channels
    generalTicketTranscripts: '1361439312666820700',
    inGameTicketTranscripts: '1361678254125224148',
    staffReportTicketTranscripts: '1361678271208624189',
    ownershipTicketTranscripts: '1373059369675259964',
    
    // Internal Affairs Channels
    internalAffairsCategory: '1361449627672379623',
    internalAffairsTranscripts: '1361450466591899668'
};

/**
 * Channel configuration for specific use cases
 */
const channelConfig = {
    // Announcement channels for different types of events
    announcements: {
        promotions: channelIds.infractionPromotionAnnouncement,
        infractions: channelIds.infractionPromotionAnnouncement,
        staffChanges: channelIds.infractionPromotionAnnouncement
    },
    
    // Transcript archive channels based on ticket category
    transcripts: {
        'General Support': channelIds.generalTicketTranscripts,
        'In-game Report': channelIds.inGameTicketTranscripts,
        'Staff Report': channelIds.staffReportTicketTranscripts,
        'Ownership Support': channelIds.ownershipTicketTranscripts,
        'Internal Affairs': channelIds.internalAffairsTranscripts
    },

    // Category mapping for tickets
    ticketCategories: {
        'General Support': channelIds.ticketCategories.generalSupport,
        'Staff Report': channelIds.ticketCategories.staffReport,
        'In-game Report': channelIds.ticketCategories.inGameReport,
        'Ownership Support': channelIds.ticketCategories.ownershipSupport
    }
};

module.exports = {
    channelIds,
    channelConfig
};