// commands/officeinfo.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('officeinfo')
        .setDescription('Get information about Internal Affairs offices')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active offices'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show office statistics')),
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
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'list') {
            await handleOfficeList(interaction, client);
        } else if (subcommand === 'stats') {
            await handleOfficeStats(interaction, client);
        } else {
            await interaction.reply({
                content: 'Unknown subcommand.',
                ephemeral: true
            });
        }
    }
};

// Handle office list subcommand
async function handleOfficeList(interaction, client) {
    try {
        // Get active offices from database
        const activeOffices = await db.getActiveOffices();
        
        if (activeOffices.length === 0) {
            return interaction.reply({
                content: 'There are no active Internal Affairs offices at this time.',
                ephemeral: true
            });
        }
        
        // Create a nice embed list
        const embed = new EmbedBuilder()
            .setTitle('Active Internal Affairs Offices')
            .setColor('#FF5555')
            .setDescription(`There are currently ${activeOffices.length} active offices.`)
            .setTimestamp();
        
        // Add fields for each active office (limit to 25 due to embed limits)
        const displayCount = Math.min(activeOffices.length, 25);
        
        for (let i = 0; i < displayCount; i++) {
            const office = activeOffices[i];
            
            // Try to get target and creator usernames
            let targetName = office.targetId;
            let creatorName = office.creatorId;
            
            try {
                const targetUser = await client.users.fetch(office.targetId);
                targetName = targetUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${office.targetId}`);
            }
            
            try {
                const creatorUser = await client.users.fetch(office.creatorId);
                creatorName = creatorUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${office.creatorId}`);
            }
            
            // Format duration
            const createdDate = new Date(office.createdAt);
            const now = new Date();
            const durationMs = now - createdDate;
            const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            let duration = '';
            if (days > 0) {
                duration = `${days}d ${hours}h`;
            } else {
                duration = `${hours}h`;
            }
            
            embed.addFields({
                name: `Office: ${office._id}`,
                value: `Target: ${targetName}\nCreated by: ${creatorName}\nDuration: ${duration}\nChannel: <#${office.channelId}>`
            });
        }
        
        // Add a note if there are more offices than we can display
        if (activeOffices.length > 25) {
            embed.setFooter({ text: `Showing 25 of ${activeOffices.length} active offices.` });
        }
        
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error fetching office list:', error);
        await interaction.reply({
            content: 'There was an error fetching the office list. Please try again later.',
            ephemeral: true
        });
    }
}

// Handle office stats subcommand
async function handleOfficeStats(interaction, client) {
    try {
        // Get all offices from database (both active and closed)
        const allOffices = await db.getAllOffices();
        
        if (allOffices.length === 0) {
            return interaction.reply({
                content: 'There are no Internal Affairs offices to analyze.',
                ephemeral: true
            });
        }
        
        // Get active offices
        const activeOffices = allOffices.filter(office => office.status === 'open');
        
        // Get closed offices
        const closedOffices = allOffices.filter(office => office.status === 'closed');
        
        // Get offices created in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentOffices = allOffices.filter(office => 
            new Date(office.createdAt) >= thirtyDaysAgo
        );
        
        // Calculate average duration of closed offices
        let totalDurationMs = 0;
        let countForAverage = 0;
        
        for (const office of closedOffices) {
            if (office.createdAt && office.closedAt) {
                const createdDate = new Date(office.createdAt);
                const closedDate = new Date(office.closedAt);
                const durationMs = closedDate - createdDate;
                
                totalDurationMs += durationMs;
                countForAverage++;
            }
        }
        
        let averageDuration = 'N/A';
        if (countForAverage > 0) {
            const averageDurationMs = totalDurationMs / countForAverage;
            const averageDays = Math.floor(averageDurationMs / (1000 * 60 * 60 * 24));
            const averageHours = Math.floor((averageDurationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            averageDuration = `${averageDays}d ${averageHours}h`;
        }
        
        // Count offices by creator
        const creatorCounts = {};
        for (const office of allOffices) {
            creatorCounts[office.creatorId] = (creatorCounts[office.creatorId] || 0) + 1;
        }
        
        // Find top creators
        const topCreators = Object.entries(creatorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        // Format top creators
        const topCreatorsText = await Promise.all(topCreators.map(async ([userId, count]) => {
            try {
                const user = await client.users.fetch(userId);
                return `${user.tag}: ${count} offices`;
            } catch {
                return `<@${userId}>: ${count} offices`;
            }
        }));
        
        // Create a nice embed with the statistics
        const embed = new EmbedBuilder()
            .setTitle('Internal Affairs Office Statistics')
            .setColor('#FF5555')
            .setDescription(`Statistics for all Internal Affairs offices.`)
            .addFields(
                { name: 'Total Offices', value: allOffices.length.toString(), inline: true },
                { name: 'Active Offices', value: activeOffices.length.toString(), inline: true },
                { name: 'Closed Offices', value: closedOffices.length.toString(), inline: true },
                { name: 'Recent (30 days)', value: recentOffices.length.toString(), inline: true },
                { name: 'Average Duration', value: averageDuration, inline: true },
                { name: 'Oldest Active', value: getOldestActiveOffice(activeOffices), inline: true },
                { name: 'Top Creators', value: topCreatorsText.join('\n') || 'None' }
            )
            .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error fetching office stats:', error);
        await interaction.reply({
            content: 'There was an error fetching office statistics. Please try again later.',
            ephemeral: true
        });
    }
}

// Helper function to get the oldest active office
function getOldestActiveOffice(activeOffices) {
    if (activeOffices.length === 0) return 'None';
    
    let oldestOffice = activeOffices[0];
    let oldestDate = new Date(oldestOffice.createdAt);
    
    for (let i = 1; i < activeOffices.length; i++) {
        const officeDate = new Date(activeOffices[i].createdAt);
        if (officeDate < oldestDate) {
            oldestOffice = activeOffices[i];
            oldestDate = officeDate;
        }
    }
    
    // Calculate how long ago
    const now = new Date();
    const durationMs = now - oldestDate;
    const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days}d ${hours}h ago (ID: ${oldestOffice._id})`;
}