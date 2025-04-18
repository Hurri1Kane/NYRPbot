// commands/infractions.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('View infractions')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The staff member to view infractions for')
                .setRequired(false)),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Internal Affairs or higher rank
        const hasPermission = interaction.member.roles.cache.some(role => 
            [staffRoles.trialInternalAffairs.id, staffRoles.internalAffairs.id, 
             staffRoles.internalAffairsDirector.id, staffRoles.highRank.id,
             staffRoles.seniorHighRank.id].includes(role.id)
        );
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be Trial Internal Affairs or higher to use this command.',
                ephemeral: true
            });
        }
        
        const targetUser = interaction.options.getUser('user');
        
        // If a specific user was provided, show their infractions
        if (targetUser) {
            await showUserInfractions(interaction, client, targetUser);
        } else {
            // Otherwise show recent infractions
            await showRecentInfractions(interaction, client);
        }
    }
};

// Show infractions for a specific user
async function showUserInfractions(interaction, client, targetUser) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Get user's infractions from database
        const infractions = await db.getUserInfractions(targetUser.id);
        
        if (infractions.length === 0) {
            return interaction.editReply({
                content: `${targetUser.tag} has no infractions on record.`,
                ephemeral: true
            });
        }
        
        // Create an embed to display the infractions
        const embed = new EmbedBuilder()
            .setTitle(`Infractions for ${targetUser.tag}`)
            .setColor('#FF5555')
            .setDescription(`Showing ${infractions.length} infraction(s)`)
            .setTimestamp();
        
        // Add fields for each infraction (limit to 25 due to embed limits)
        const displayCount = Math.min(infractions.length, 25);
        
        for (let i = 0; i < displayCount; i++) {
            const infraction = infractions[i];
            
            // Format the infraction type
            const formattedType = formatInfractionType(infraction.type);
            
            // Format timestamp
            const timestamp = new Date(infraction.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD format
            
            // Try to get issuer username
            let issuerName = `<@${infraction.issuer}>`;
            try {
                const issuerUser = await client.users.fetch(infraction.issuer);
                issuerName = issuerUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${infraction.issuer}`);
            }
            
            // Format status
            let statusText = '';
            switch (infraction.status) {
                case 'pending_approval':
                    statusText = '⏳ Pending Approval';
                    break;
                case 'active':
                    statusText = '🔴 Active';
                    break;
                case 'completed':
                    statusText = '✅ Completed';
                    break;
                case 'manually_completed':
                    statusText = '🔄 Manually Completed';
                    break;
                case 'denied':
                    statusText = '❌ Denied';
                    break;
                default:
                    statusText = infraction.status;
            }
            
            // Create field content
            let fieldContent = `Type: ${formattedType}\nDate: ${timestamp}\nIssued by: ${issuerName}\nStatus: ${statusText}`;
            
            // Add appealable status
            fieldContent += `\nAppealable: ${infraction.appealable === true ? '✅ Yes' : infraction.appealable === false ? '❌ No' : '❓ Unknown'}`;
            
            // Add additional information based on type
            if (infraction.type.startsWith('suspension_') && infraction.duration) {
                fieldContent += `\nDuration: ${infraction.duration}`;
            }
            
            // Add reason
            fieldContent += `\nReason: ${infraction.reason}`;
            
            // Add evidence if available
            if (infraction.evidence && infraction.evidence.length > 0) {
                fieldContent += `\nEvidence: ${infraction.evidence.map((link, index) => `[Link ${index + 1}](${link})`).join(', ')}`;
            }
            
            embed.addFields({
                name: `Infraction ID: ${infraction._id}`,
                value: fieldContent
            });
        }
        
        // Add a note if there are more infractions than we can display
        if (infractions.length > 25) {
            embed.setFooter({ text: `Showing 25 of ${infractions.length} infractions. Use more specific queries to see others.` });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error fetching user infractions:', error);
        
        // If we've already deferred, edit the reply
        if (interaction.deferred) {
            await interaction.editReply({
                content: 'There was an error fetching infractions. Please try again later.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: 'There was an error fetching infractions. Please try again later.',
                ephemeral: true
            });
        }
    }
}

// Show recent infractions across all users
async function showRecentInfractions(interaction, client) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Get recent infractions from database (e.g., last 50)
        const infractions = await db.getAllInfractions(50);
        
        if (infractions.length === 0) {
            return interaction.editReply({
                content: 'There are no infractions on record.',
                ephemeral: true
            });
        }
        
        // Create an embed to display the infractions
        const embed = new EmbedBuilder()
            .setTitle('Recent Infractions')
            .setColor('#FF5555')
            .setDescription(`Showing ${infractions.length} recent infraction(s)`)
            .setTimestamp();
        
        // Add fields for each infraction (limit to 25 due to embed limits)
        const displayCount = Math.min(infractions.length, 25);
        
        for (let i = 0; i < displayCount; i++) {
            const infraction = infractions[i];
            
            // Format the infraction type
            const formattedType = formatInfractionType(infraction.type);
            
            // Format timestamp
            const timestamp = new Date(infraction.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD format
            
            // Try to get user and issuer usernames
            let userName = `<@${infraction.userId}>`;
            let issuerName = `<@${infraction.issuer}>`;
            
            try {
                const user = await client.users.fetch(infraction.userId);
                userName = user.tag;
            } catch (error) {
                console.log(`Could not fetch user ${infraction.userId}`);
            }
            
            try {
                const issuerUser = await client.users.fetch(infraction.issuer);
                issuerName = issuerUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${infraction.issuer}`);
            }
            
            // Format status
            let statusText = '';
            switch (infraction.status) {
                case 'pending_approval':
                    statusText = '⏳ Pending Approval';
                    break;
                case 'active':
                    statusText = '🔴 Active';
                    break;
                case 'completed':
                    statusText = '✅ Completed';
                    break;
                case 'manually_completed':
                    statusText = '🔄 Manually Completed';
                    break;
                case 'denied':
                    statusText = '❌ Denied';
                    break;
                default:
                    statusText = infraction.status;
            }
            
            // Create field content
            let fieldContent = `User: ${userName}\nType: ${formattedType}\nDate: ${timestamp}\nIssued by: ${issuerName}\nStatus: ${statusText}`;
            
            // Add appealable status
            fieldContent += `\nAppealable: ${infraction.appealable === true ? '✅ Yes' : infraction.appealable === false ? '❌ No' : '❓ Unknown'}`;
            
            // Add reason (shortened if too long)
            const maxReasonLength = 75;
            const reason = infraction.reason.length > maxReasonLength 
                ? infraction.reason.substring(0, maxReasonLength) + '...' 
                : infraction.reason;
            
            fieldContent += `\nReason: ${reason}`;
            
            // Add evidence if available (shortened for overview)
            if (infraction.evidence && infraction.evidence.length > 0) {
                fieldContent += `\nEvidence: ${infraction.evidence.length} link(s) provided`;
            }
            
            embed.addFields({
                name: `Infraction ID: ${infraction._id}`,
                value: fieldContent
            });
        }
        
        // Add a note if there are more infractions than we can display
        if (infractions.length > 25) {
            embed.setFooter({ text: `Showing 25 of ${infractions.length} infractions. Use a specific user query to see others.` });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error fetching recent infractions:', error);
        
        // If we've already deferred, edit the reply
        if (interaction.deferred) {
            await interaction.editReply({
                content: 'There was an error fetching infractions. Please try again later.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: 'There was an error fetching infractions. Please try again later.',
                ephemeral: true
            });
        }
    }
}

// Helper function to format infraction type for display
function formatInfractionType(type) {
    if (type.startsWith('suspension_')) {
        const durationMap = {
            'suspension_24h': '24 hours',
            'suspension_48h': '48 hours',
            'suspension_72h': '72 hours',
            'suspension_1w': '1 week',
            'suspension_2w': '2 weeks'
        };
        return `Suspension (${durationMap[type] || type.split('_')[1]})`;
    }
    
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
}