// commands/debug.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Debug commands for troubleshooting')
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('Show your roles and compare with bot configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('serverroles')
                .setDescription('List all roles in the server with their IDs')),
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        switch (subcommand) {
            case 'roles':
                await handleDebugRoles(interaction, client);
                break;
            case 'serverroles':
                await handleDebugServerRoles(interaction, client);
                break;
            default:
                await interaction.reply({
                    content: 'Unknown subcommand.',
                    ephemeral: true
                });
        }
    }
};

// Handle debug roles subcommand
async function handleDebugRoles(interaction, client) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const member = interaction.member;
        const staffRoles = client.config.staffRoles;
        
        // Get all roles the member has
        const memberRoles = member.roles.cache.map(role => ({
            name: role.name,
            id: role.id,
            color: role.color.toString(16),
            position: role.position
        }));
        
        // Sort roles by position (highest first)
        memberRoles.sort((a, b) => b.position - a.position);
        
        // Check which configured staff roles the member has
        const staffRolesHeld = [];
        
        for (const [key, roleData] of Object.entries(staffRoles)) {
            if (member.roles.cache.has(roleData.id)) {
                staffRolesHeld.push({
                    key: key,
                    name: roleData.name,
                    id: roleData.id,
                    category: roleData.category || 'Special'
                });
            }
        }
        
        // Get the highest staff role
        let highestRole = 'None';
        const rankOrder = [
            'trialModerator', 'moderator', 'seniorModerator', 'headModerator',
            'trialAdmin', 'admin', 'seniorAdmin', 'headAdmin',
            'trialInternalAffairs', 'internalAffairs', 'internalAffairsDirector',
            'staffSupervisorInTraining', 'staffSupervisor', 'leadStaffSupervisor',
            'trialManager', 'manager', 'seniorManager',
            'assistantDirector', 'leadAssistantDirector', 'viceDeputyDirector', 'deputyDirector', 'director'
        ];
        
        // Start from highest (director) and go down
        for (let i = rankOrder.length - 1; i >= 0; i--) {
            const roleKey = rankOrder[i];
            const roleData = staffRoles[roleKey];
            
            if (roleData && member.roles.cache.has(roleData.id)) {
                highestRole = `${roleData.name} (${roleKey})`;
                break;
            }
        }
        
        // Create an embed with the results
        const embed = new EmbedBuilder()
            .setTitle('Role Debug Information')
            .setColor('#00AAFF')
            .setDescription(`Role information for ${member.user.tag}`)
            .addFields(
                { name: 'User ID', value: member.user.id, inline: true },
                { name: 'Is Staff?', value: member.roles.cache.has(staffRoles.staffTeam.id) ? 'Yes' : 'No', inline: true },
                { name: 'Highest Staff Role', value: highestRole, inline: true }
            )
            .setTimestamp();
        
        // Add staff roles field
        if (staffRolesHeld.length > 0) {
            let staffRolesContent = '';
            
            // Group by category
            const categorized = {};
            for (const role of staffRolesHeld) {
                if (!categorized[role.category]) {
                    categorized[role.category] = [];
                }
                categorized[role.category].push(role);
            }
            
            // Add each category
            for (const [category, roles] of Object.entries(categorized)) {
                staffRolesContent += `**${category}:**\n`;
                
                for (const role of roles) {
                    staffRolesContent += `- ${role.name} (${role.key}): ${role.id}\n`;
                }
                
                staffRolesContent += '\n';
            }
            
            embed.addFields({
                name: 'Staff Roles Held',
                value: staffRolesContent.trim()
            });
        } else {
            embed.addFields({
                name: 'Staff Roles Held',
                value: 'No staff roles detected'
            });
        }
        
        // Add all roles field
        let allRolesContent = '';
        
        // Only show first 15 roles if there are too many
        const displayCount = Math.min(memberRoles.length, 15);
        for (let i = 0; i < displayCount; i++) {
            const role = memberRoles[i];
            allRolesContent += `- ${role.name}: ${role.id} (Position: ${role.position})\n`;
        }
        
        if (memberRoles.length > 15) {
            allRolesContent += `\n... and ${memberRoles.length - 15} more roles`;
        }
        
        embed.addFields({
            name: `All Roles (${memberRoles.length})`,
            value: allRolesContent || 'No roles'
        });
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error debugging roles:', error);
        await interaction.editReply({
            content: 'There was an error debugging roles. Please try again later.',
            ephemeral: true
        });
    }
}

// Handle debug server roles subcommand
async function handleDebugServerRoles(interaction, client) {
    // Check if user has Internal Affairs or higher rank
    const staffRoles = client.config.staffRoles;
    const hasPermission = interaction.member.roles.cache.some(role => 
        [staffRoles.internalAffairsDirector.id, staffRoles.highRank.id,
         staffRoles.seniorHighRank.id].includes(role.id)
    );
    
    if (!hasPermission) {
        return interaction.reply({
            content: 'You must be Internal Affairs Director or higher to use this command.',
            ephemeral: true
        });
    }
    
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const guild = interaction.guild;
        
        // Get all roles in the server
        const allRoles = guild.roles.cache.sort((a, b) => b.position - a.position);
        
        // Create an embed with the results
        const embed = new EmbedBuilder()
            .setTitle('Server Roles Debug Information')
            .setColor('#00AAFF')
            .setDescription(`Total roles in ${guild.name}: ${allRoles.size}`)
            .setTimestamp();
        
        let chunkSize = 20;  // Discord fields have a 1024 character limit
        let chunks = Math.ceil(allRoles.size / chunkSize);
        
        for (let i = 0; i < chunks; i++) {
            let rolesContent = '';
            let startIdx = i * chunkSize;
            let endIdx = Math.min((i + 1) * chunkSize, allRoles.size);
            
            let count = 0;
            for (const [id, role] of allRoles.entries()) {
                if (count >= startIdx && count < endIdx) {
                    rolesContent += `- ${role.name}: \`${role.id}\` (Position: ${role.position})\n`;
                }
                count++;
                if (count >= endIdx) break;
            }
            
            embed.addFields({
                name: `Roles ${startIdx + 1}-${endIdx}`,
                value: rolesContent || 'No roles'
            });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error debugging server roles:', error);
        await interaction.editReply({
            content: 'There was an error debugging server roles. Please try again later.',
            ephemeral: true
        });
    }
}