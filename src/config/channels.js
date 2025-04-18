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
    
    // Ticket System Channels
    ticketCategory: '1357029741105594619',
    generalTicketTranscripts: '1361439312666820700',
    inGameTicketTranscripts: '1361678254125224148',
    staffReportTicketTranscripts: '1361678271208624189',
    
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
      'In-Game Reports': channelIds.inGameTicketTranscripts,
      'Staff Reports': channelIds.staffReportTicketTranscripts,
      'Internal Affairs': channelIds.internalAffairsTranscripts
    }
  };
  
  module.exports = {
    channelIds,
    channelConfig
  };