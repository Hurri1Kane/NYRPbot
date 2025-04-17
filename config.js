// config.js
module.exports = {
    // Staff role hierarchy
    staffRoles: {
        // Staff Ranks (Lowest to Highest)
        trialModerator: { id: '1357029738081947824', name: 'Trial Moderator', category: 'moderation' },
        moderator: { id: '1357029738081947825', name: 'Moderator', category: 'moderation' },
        seniorModerator: { id: '1357029738081947826', name: 'Senior Moderator', category: 'moderation' },
        headModerator: { id: '1357029738081947827', name: 'Head Moderator', category: 'moderation' },
        trialAdmin: { id: '1357029738081947829', name: 'Trial Administrator', category: 'administration' },
        admin: { id: '1357029738081947830', name: 'Administrator', category: 'administration' },
        seniorAdmin: { id: '1357029738115240139', name: 'Senior Administrator', category: 'administration' },
        headAdmin: { id: '1357029738115240140', name: 'Head Administrator', category: 'administration' },
        trialInternalAffairs: { id: '1357029738115240142', name: 'Trial Internal Affairs', category: 'internalAffairs' },
        internalAffairs: { id: '1357029738115240143', name: 'Internal Affairs', category: 'internalAffairs' },
        internalAffairsDirector: { id: '1357029738115240144', name: 'Internal Affairs Director', category: 'internalAffairs' },
        staffSupervisorInTraining: { id: '1357029738115240146', name: 'Staff Supervisor in Training', category: 'supervision' },
        staffSupervisor: { id: '1357029738115240147', name: 'Staff Supervisor', category: 'supervision' },
        leadStaffSupervisor: { id: '1357029738115240148', name: 'Lead Staff Supervisor', category: 'supervision' },
        trialManager: { id: '1357029738144727272', name: 'Trial Manager', category: 'management' },
        manager: { id: '1357029738144727273', name: 'Manager', category: 'management' },
        seniorManager: { id: '1357029738144727274', name: 'Senior Manager', category: 'management' },
        assistantDirector: { id: '1357029738157179175', name: 'Assistant Director', category: 'directive' },
        leadAssistantDirector: { id: '1360330107339669514', name: 'Lead Assistant Director', category: 'directive' },
        viceDeputyDirector: { id: '1357856667970048061', name: 'Vice Deputy Director', category: 'directive' },
        deputyDirector: { id: '1357029738157179179', name: 'Deputy Director', category: 'directive' },
        director: { id: '1357029738173960287', name: 'Director', category: 'directive' },

        // Special Status Roles
        underInvestigation: { id: '1350198102472261794', name: 'Under Investigation' },
        blacklisted: { id: '1345024258908229744', name: 'Blacklisted' },
        suspended: { id: '1353863685717622918', name: 'Suspended' },

        // General Roles
        staffTeam: { id: '1357029738052452487', name: 'NYRP Staff Team' },
        seniorHighRank: { id: '1357029738052452483', name: 'Senior High Rank' },
        highRank: { id: '1357029738035548229', name: 'High Rank' },
        moderation: { id: '1357029738081947823', name: 'Moderation' },
        administration: { id: '1357029738081947828', name: 'Administration' },
        internalAffairsCategory: { id: '1357029738115240141', name: 'Internal Affairs' },
        management: { id: '1346911928475193354', name: 'Management' },
        directiveTeam: { id: '1358014708866875572', name: 'Directive Team' }
    },
    
    // Channel IDs
    channels: {
        infractionApproval: '1358031305463304302',
        staffLog: '1357029741021892748',
        infractionAnnouncement: '1357029740094951513',
        promotionAnnouncement: '1357029740094951513',
        ticketCategory: '1357029741105594619'
    },
    
    // Cooldowns for commands (in milliseconds)
    cooldowns: {
        infract: 5000,
        promote: 10000,
        ticket: 60000,
        officecreate: 30000
    },
    
    // Database configuration
    database: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        name: process.env.DB_NAME || 'nyrp'
    },
    
    // Ticket categories
    ticketCategories: [
        { id: 'general', name: 'General Support', emoji: '❓' },
        { id: 'ingame', name: 'In-Game Report', emoji: '🎮' },
        { id: 'staff', name: 'Staff Report', emoji: '🛡️' }
    ],
    
    // Infraction types
    infractionTypes: {
        warning: { name: 'Warning', color: '#FFA500', description: 'Formal warning with no additional consequences' },
        suspension_24h: { name: 'Suspension (24h)', color: '#FF5555', description: 'Suspend for 24 hours', duration: '24 hours' },
        suspension_48h: { name: 'Suspension (48h)', color: '#FF5555', description: 'Suspend for 48 hours', duration: '48 hours' },
        suspension_72h: { name: 'Suspension (72h)', color: '#FF5555', description: 'Suspend for 72 hours', duration: '72 hours' },
        suspension_1w: { name: 'Suspension (1 week)', color: '#FF5555', description: 'Suspend for 1 week', duration: '1 week' },
        suspension_2w: { name: 'Suspension (2 weeks)', color: '#FF5555', description: 'Suspend for 2 weeks', duration: '2 weeks' },
        demotion: { name: 'Demotion', color: '#9A5BAF', description: 'Reduce to a lower rank' },
        blacklist: { name: 'Blacklist', color: '#000000', description: 'Permanent removal from staff team' },
        under_investigation: { name: 'Under Investigation', color: '#AF905B', description: 'Place under investigation' }
    },
    
    // Promotion settings
    promotionSettings: {
        requireReason: true,
        announcePromotions: true,
        minReasonLength: 10,
        dmPromoted: true
    }
};