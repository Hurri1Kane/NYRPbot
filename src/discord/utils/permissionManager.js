// src/discord/utils/permissionManager.js
const { roleIds } = require('../../config/roles');
const logger = require('../../utils/logger');

/**
 * Role hierarchy for permission checks
 * Roles are ordered from highest (index 0) to lowest permission level
 */
const roleHierarchy = [
  // Directive Team - Highest Authority
  roleIds.Director,
  roleIds.DeputyDirector,
  roleIds.ViceDeputyDirector,
  roleIds.LeadAssistantDirector,
  roleIds.AssistantDirector,
  
  // Management Team
  roleIds.SeniorManager,
  roleIds.Manager,
  roleIds.TrialManager,
  
  // Supervision Team
  roleIds.LeadStaffSupervisor,
  roleIds.StaffSupervisor,
  roleIds.StaffSupervisorInTraining,
  
  // Internal Affairs Team
  roleIds.InternalAffairsDirector,
  roleIds.InternalAffairs,
  roleIds.TrialInternalAffairs,
  
  // Administration Team
  roleIds.HeadAdministrator,
  roleIds.SeniorAdministrator,
  roleIds.Administrator,
  roleIds.TrialAdministrator,
  
  // Moderation Team - Lowest Authority
  roleIds.HeadModerator,
  roleIds.SeniorModerator,
  roleIds.Moderator,
  roleIds.TrialModerator
];

// Map role IDs to their index in the hierarchy for quick lookups
const roleHierarchyIndexMap = {};
roleHierarchy.forEach((roleId, index) => {
  roleHierarchyIndexMap[roleId] = index;
});

// Define permission presets for easier command configuration
const PERMISSION_PRESETS = {
  MODERATOR_PLUS: 'moderator+',         // All staff members
  ADMINISTRATOR_PLUS: 'administrator+',  // Administrator ranks and higher
  INTERNAL_AFFAIRS_PLUS: 'ia+',          // Internal Affairs ranks and higher
  SUPERVISOR_PLUS: 'supervisor+',        // Supervisor ranks and higher
  MANAGER_PLUS: 'manager+',              // Manager ranks and higher
  DIRECTOR_PLUS: 'director+',            // Director ranks only
  OWNER_ONLY: 'owner',                   // Server owner only
  DEVELOPER: 'developer'                 // Bot developers (specified by ID)
};

// Developer user IDs (can override any permission check)
const developerIds = process.env.DEVELOPER_IDS ? process.env.DEVELOPER_IDS.split(',') : [];

/**
 * Get the highest role a user has in the hierarchy
 * @param {Object} member - Discord GuildMember object
 * @returns {Object} The highest role and its hierarchy index
 */
function getHighestRole(member) {
  let highestRole = null;
  let highestIndex = Infinity;
  
  // Check each role the member has
  for (const roleId of member.roles.cache.keys()) {
    // If this role is in our hierarchy and has a higher rank (lower index)
    if (roleHierarchyIndexMap[roleId] !== undefined && roleHierarchyIndexMap[roleId] < highestIndex) {
      highestIndex = roleHierarchyIndexMap[roleId];
      highestRole = roleId;
    }
  }
  
  return { roleId: highestRole, hierarchyIndex: highestIndex };
}

/**
 * Get the hierarchy index for a permission level
 * @param {string} permission - Permission level or role ID
 * @returns {number} Hierarchy index 
 */
function getPermissionHierarchyIndex(permission) {
  // Handle preset permission levels
  switch (permission) {
    case PERMISSION_PRESETS.MODERATOR_PLUS:
      return roleHierarchyIndexMap[roleIds.TrialModerator];
    case PERMISSION_PRESETS.ADMINISTRATOR_PLUS:
      return roleHierarchyIndexMap[roleIds.TrialAdministrator];
    case PERMISSION_PRESETS.INTERNAL_AFFAIRS_PLUS:
      return roleHierarchyIndexMap[roleIds.TrialInternalAffairs];
    case PERMISSION_PRESETS.SUPERVISOR_PLUS:
      return roleHierarchyIndexMap[roleIds.StaffSupervisorInTraining];
    case PERMISSION_PRESETS.MANAGER_PLUS:
      return roleHierarchyIndexMap[roleIds.TrialManager];
    case PERMISSION_PRESETS.DIRECTOR_PLUS:
      return roleHierarchyIndexMap[roleIds.AssistantDirector];
    default:
      // If it's a direct role ID, return its index
      if (roleHierarchyIndexMap[permission] !== undefined) {
        return roleHierarchyIndexMap[permission];
      }
      // If not found, return a value that ensures the check will fail
      return -1;
  }
}

/**
 * Check if a user has permission to use a command
 * @param {Object} interaction - Discord interaction
 * @param {Array|string} requiredPermissions - Required permission level(s)
 * @returns {Object} Result with hasPermission and message
 */
async function checkPermissions(interaction, requiredPermissions) {
  // If no permissions are specified, allow all staff
  if (!requiredPermissions) {
    requiredPermissions = PERMISSION_PRESETS.MODERATOR_PLUS;
  }
  
  // Convert single permission to array
  if (!Array.isArray(requiredPermissions)) {
    requiredPermissions = [requiredPermissions];
  }
  
  const member = interaction.member;
  
  // Always allow server owner
  if (member.id === interaction.guild.ownerId) {
    return { hasPermission: true };
  }
  
  // Always allow developers
  if (developerIds.includes(member.id)) {
    return { hasPermission: true };
  }
  
  // Check if user is blacklisted - blacklisted users can't use any commands
  if (member.roles.cache.has(roleIds.Blacklisted)) {
    return { 
      hasPermission: false,
      message: 'You are blacklisted from the staff team and cannot use any staff commands.'
    };
  }
  
  // Check if user is suspended - suspended users can't use any commands except basic info ones
  if (member.roles.cache.has(roleIds.Suspended)) {
    // You could have a list of allowed commands during suspension
    // For now, deny all commands during suspension
    return { 
      hasPermission: false,
      message: 'You are currently suspended from the staff team and cannot use staff commands.'
    };
  }
  
  // Check if the user has any staff role at all
  if (!member.roles.cache.has(roleIds.NyrpStaffTeam)) {
    return { 
      hasPermission: false,
      message: 'You are not part of the staff team.'
    };
  }
  
  // Get the user's highest role
  const userHighestRole = getHighestRole(member);
  
  // If user doesn't have any recognized role in the hierarchy
  if (userHighestRole.roleId === null) {
    logger.warn(`User ${member.user.tag} (${member.id}) has staff team role but no specific rank role.`);
    return { 
      hasPermission: false,
      message: 'You have the staff team role but no specific rank role. Contact a manager to fix your roles.'
    };
  }
  
  // Check each permission level - user only needs to meet one of them
  for (const permission of requiredPermissions) {
    // Special case for owner-only commands
    if (permission === PERMISSION_PRESETS.OWNER_ONLY) {
      if (member.id === interaction.guild.ownerId) {
        return { hasPermission: true };
      }
      continue; // Skip to next permission check
    }
    
    // Special case for developer-only commands
    if (permission === PERMISSION_PRESETS.DEVELOPER) {
      if (developerIds.includes(member.id)) {
        return { hasPermission: true };
      }
      continue; // Skip to next permission check
    }
    
    // Get the hierarchy index for this permission
    const requiredHierarchyIndex = getPermissionHierarchyIndex(permission);
    
    // Lower hierarchy index means higher rank
    // Check if user's highest role is high enough in the hierarchy
    if (userHighestRole.hierarchyIndex <= requiredHierarchyIndex) {
      return { hasPermission: true };
    }
  }
  
  // If we get here, the user doesn't have any of the required permissions
  return { 
    hasPermission: false,
    message: 'You do not have the required rank to use this command.'
  };
}

// Export everything needed for permission checking
module.exports = checkPermissions;
module.exports.PERMISSION_PRESETS = PERMISSION_PRESETS;
module.exports.roleHierarchy = roleHierarchy;
module.exports.getHighestRole = getHighestRole;