// src/config/roles.js
/**
 * These IDs are referenced throughout the application for permissions and role management DO NOT DELETE!
 */
const roleIds = {
    // Moderation Team Roles
    TrialModerator: '1357029738081947824',
    Moderator: '1357029738081947825',
    SeniorModerator: '1357029738081947826',
    HeadModerator: '1357029738081947827',
  
    // Administration Team Roles
    TrialAdministrator: '1357029738081947829',
    Administrator: '1357029738081947830',
    SeniorAdministrator: '1357029738115240139',
    HeadAdministrator: '1357029738115240140',
  
    // Internal Affairs Team Roles
    TrialInternalAffairs: '1357029738115240142',
    InternalAffairs: '1357029738115240143',
    HeadInternalAffairs: '1372661260516200581',
    InternalAffairsSupervisor: '1357029738115240144',
  //   
    // Management Team Roles
    TrialManager: '1357029738144727272',
    Manager: '1357029738144727273',
    SeniorManager: '1357029738144727274',
    
    // Staff Overseer Roles
    TrialStaffOverseer: '1370825197090767049',
    StaffOverseer: '1370825278045032639',
  
    // Directive Team Roles
    AssistantDirector: '1357029738157179175',
    LeadAssistantDirector: '1360330107339669514',
    ViceDeputyDirector: '1357856667970048061',
    DeputyDirector: '1357029738157179179',
    Director: '1357029738173960287',
  
    // Special Status Roles
    UnderInvestigation: '1357029738173960292',
    Blacklisted: '1357029738173960291',
    Suspended: '1362466330699108483',
  
    // General Category Roles
    NyrpStaffTeam: '1357029738052452487',
    SeniorHighRank: '1357029738052452483',
    HighRank: '1357029738035548229',
    ModerationCategory: '1357029738081947823',
    AdministrationCategory: '1357029738081947828',
    InternalAffairsCategory: '1357029738115240141',
    ManagementCategory: '1357029738144727271',
    DirectiveTeam: '1358014708866875572'
  };
  
  /**
   * Role name mapping (for readability in logs and messages)
   */
  const roleNames = {
    // Moderation Team Roles
    [roleIds.TrialModerator]: 'Trial Moderator',
    [roleIds.Moderator]: 'Moderator',
    [roleIds.SeniorModerator]: 'Senior Moderator',
    [roleIds.HeadModerator]: 'Head Moderator',
  
    // Administration Team Roles
    [roleIds.TrialAdministrator]: 'Trial Administrator',
    [roleIds.Administrator]: 'Administrator',
    [roleIds.SeniorAdministrator]: 'Senior Administrator',
    [roleIds.HeadAdministrator]: 'Head Administrator',
  
    // Internal Affairs Team Roles
    [roleIds.TrialInternalAffairs]: 'Trial Internal Affairs',
    [roleIds.InternalAffairs]: 'Internal Affairs',
    [roleIds.HeadInternalAffairs]: 'Head Internal Affairs',
    [roleIds.InternalAffairsSupervisor]: 'Internal Affairs Supervisor',
  
    // Management Team Roles
    [roleIds.TrialManager]: 'Trial Manager',
    [roleIds.Manager]: 'Manager',
    [roleIds.SeniorManager]: 'Senior Manager',

    // Staff Overseer Roles
    [roleIds.TrialStaffOverseer]: 'Trial Staff Overseer',
    [roleIds.StaffOverseer]: 'Staff Overseer',
  
    // Directive Team Roles
    [roleIds.AssistantDirector]: 'Assistant Director',
    [roleIds.LeadAssistantDirector]: 'Lead Assistant Director',
    [roleIds.ViceDeputyDirector]: 'Vice Deputy Director',
    [roleIds.DeputyDirector]: 'Deputy Director',
    [roleIds.Director]: 'Director',
  
    // Special Status Roles
    [roleIds.UnderInvestigation]: 'Under Investigation',
    [roleIds.Blacklisted]: 'Blacklisted',
    [roleIds.Suspended]: 'Suspended',
  
    // General Category Roles
    [roleIds.NyrpStaffTeam]: 'NYRP Staff Team',
    [roleIds.SeniorHighRank]: 'Senior High Rank',
    [roleIds.HighRank]: 'High Rank',
    [roleIds.ModerationCategory]: 'Moderation',
    [roleIds.AdministrationCategory]: 'Administration',
    [roleIds.InternalAffairsCategory]: 'Internal Affairs',
    [roleIds.ManagementCategory]: 'Management',
    [roleIds.DirectiveTeam]: 'Directive Team'
  };
  
  /**
   * Role groupings for easier management
   */
  const roleGroups = {
    allRanks: [
      // Moderation
      roleIds.TrialModerator,
      roleIds.Moderator,
      roleIds.SeniorModerator,
      roleIds.HeadModerator,
      
      // Administration
      roleIds.TrialAdministrator,
      roleIds.Administrator,
      roleIds.SeniorAdministrator,
      roleIds.HeadAdministrator,
      
      // Internal Affairs
      roleIds.TrialInternalAffairs,
      roleIds.InternalAffairs,
      roleIds.InternalAffairsDirector,
      
      // Supervision
      roleIds.StaffSupervisorInTraining,
      roleIds.StaffSupervisor,
      roleIds.LeadStaffSupervisor,
      
      // Management
      roleIds.TrialManager,
      roleIds.Manager,
      roleIds.SeniorManager,
      
      // Directive
      roleIds.AssistantDirector,
      roleIds.LeadAssistantDirector,
      roleIds.ViceDeputyDirector,
      roleIds.DeputyDirector,
      roleIds.Director
    ],
    
    moderationTeam: [
      roleIds.TrialModerator,
      roleIds.Moderator,
      roleIds.SeniorModerator,
      roleIds.HeadModerator
    ],
    
    administrationTeam: [
      roleIds.TrialAdministrator,
      roleIds.Administrator,
      roleIds.SeniorAdministrator,
      roleIds.HeadAdministrator
    ],
    
    internalAffairsTeam: [
      roleIds.TrialInternalAffairs,
      roleIds.InternalAffairs,
      roleIds.HeadInternalAffairs,
      roleIds.InternalAffairsSupervisor
    ],
    
    managementTeam: [
      roleIds.TrialManager,
      roleIds.Manager,
      roleIds.SeniorManager
    ],

    StaffOverseerTeam: [
      roleIds.TrialStaffOverseer,
      roleIds.StaffOverseer
    ],
    
    directiveTeam: [
      roleIds.AssistantDirector,
      roleIds.LeadAssistantDirector,
      roleIds.ViceDeputyDirector,
      roleIds.DeputyDirector,
      roleIds.Director
    ],
    
    specialStatus: [
      roleIds.UnderInvestigation,
      roleIds.Blacklisted,
      roleIds.Suspended
    ],
    
    categoryRoles: [
      roleIds.NyrpStaffTeam,
      roleIds.SeniorHighRank,
      roleIds.HighRank,
      roleIds.ModerationCategory,
      roleIds.AdministrationCategory,
      roleIds.InternalAffairsCategory,
      roleIds.ManagementCategory,
      roleIds.DirectiveTeam
    ],
    
    highRanks: [
      roleIds.HeadModerator,
      roleIds.HeadAdministrator,
      roleIds.InternalAffairsDirector,
      roleIds.LeadStaffSupervisor,
      ...this?.directiveTeam || []
    ],
    
    seniorHighRanks: [
      roleIds.InternalAffairsDirector,
      roleIds.LeadStaffSupervisor,
      ...this?.directiveTeam || []
    ]
  };
  
  /**
   * For each rank, determine which category role should be assigned
   */
  const rankToCategoryMap = {
    // Moderation Team
    [roleIds.TrialModerator]: roleIds.ModerationCategory,
    [roleIds.Moderator]: roleIds.ModerationCategory,
    [roleIds.SeniorModerator]: roleIds.ModerationCategory,
    [roleIds.HeadModerator]: roleIds.ModerationCategory,
    
    // Administration Team
    [roleIds.TrialAdministrator]: roleIds.AdministrationCategory,
    [roleIds.Administrator]: roleIds.AdministrationCategory,
    [roleIds.SeniorAdministrator]: roleIds.AdministrationCategory,
    [roleIds.HeadAdministrator]: roleIds.AdministrationCategory,
    
    // Internal Affairs Team
    [roleIds.TrialInternalAffairs]: roleIds.InternalAffairsCategory,
    [roleIds.InternalAffairs]: roleIds.InternalAffairsCategory,
    [roleIds.InternalAffairsDirector]: roleIds.InternalAffairsCategory,
    
    // Management Team
    [roleIds.TrialManager]: roleIds.ManagementCategory,
    [roleIds.Manager]: roleIds.ManagementCategory,
    [roleIds.SeniorManager]: roleIds.ManagementCategory,
    
    // Directive Team
    [roleIds.AssistantDirector]: roleIds.DirectiveTeam,
    [roleIds.LeadAssistantDirector]: roleIds.DirectiveTeam,
    [roleIds.ViceDeputyDirector]: roleIds.DirectiveTeam,
    [roleIds.DeputyDirector]: roleIds.DirectiveTeam,
    [roleIds.Director]: roleIds.DirectiveTeam,
    
    // Supervision Team (no specific category in the current config)
    [roleIds.StaffSupervisorInTraining]: null,
    [roleIds.StaffSupervisor]: null,
    [roleIds.LeadStaffSupervisor]: null
  };
  
  module.exports = {
    roleIds,
    roleNames,
    roleGroups,
    rankToCategoryMap
  };