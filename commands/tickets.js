// commands/tickets.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/dbHandler');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('Manage and view tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List active tickets')
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Filter tickets by status')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Open', value: 'open' },
                            { name: 'Closed', value: 'closed' },
                            { name: 'All', value: 'all' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View details of a specific ticket')
                .addStringOption(option =>
                    option.setName('ticket_id')
                        .setDescription('The ID of the ticket to view')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View ticket statistics')),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has staff team role
        const hasPermission = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be a staff member to use ticket management commands.',
                ephemeral: true
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'list') {
            await handleTicketList(interaction, client);
        } else if (subcommand === 'view') {
            await handleTicketView(interaction, client);
        } else if (subcommand === 'stats') {
            await handleTicketStats(interaction, client);
        } else {
            await interaction.reply({
                content: 'Unknown subcommand.',
                ephemeral: true
            });
        }
    }
};

/**
 * Handle ticket list subcommand
 */
async function handleTicketList(interaction, client) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Get filter status
        const status = interaction.options.getString('status') || 'open';
        
        // Get tickets based on status
        let tickets;
        if (status === 'all') {
            tickets = await db.getAllTickets(100); // Limit to 100 tickets
        } else {
            tickets = await db.getTicketsByStatus(status);
        }
        
        if (tickets.length === 0) {
            return interaction.editReply({
                content: `There are no ${status === 'all' ? '' : status + ' '}tickets to display.`,
                ephemeral: true
            });
        }
        
        // Create a nice embed list
        const statusColors = {
            'open': '#3498DB',    // Blue
            'closed': '#E74C3C'   // Red
        };
        
        const embed = new EmbedBuilder()
            .setTitle(`Ticket List - ${status.charAt(0).toUpperCase() + status.slice(1)}`)
            .setColor(status === 'all' ? '#9B59B6' : statusColors[status])
            .setDescription(`Found ${tickets.length} ticket(s).`)
            .setTimestamp();
        
        // Add fields for each ticket (limit to 25 due to embed limits)
        const displayCount = Math.min(tickets.length, 25);
        
        for (let i = 0; i < displayCount; i++) {
            const ticket = tickets[i];
            
            // Format the creation timestamp with moment
            const createdAt = moment(ticket.createdAt).format('MMM D, YYYY h:mm A');
            
            // Format time ago
            const timeAgo = moment(ticket.createdAt).fromNow();
            
            // Format priority
            const priorityEmojis = {
                'low': '🔵',
                'medium': '🟠',
                'high': '🔴'
            };
            
            // Try to get creator username
            let creatorName = ticket.creatorId;
            try {
                const creatorUser = await client.users.fetch(ticket.creatorId);
                creatorName = creatorUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${ticket.creatorId}`);
            }
            
            // Get ticket category name
            const categoryData = client.config.ticketCategories.find(c => c.id === ticket.category) || { name: 'Unknown', emoji: '❓' };
            
            let fieldValue = `**Creator**: ${creatorName}\n`;
            fieldValue += `**Created**: ${createdAt} (${timeAgo})\n`;
            fieldValue += `**Category**: ${categoryData.emoji} ${categoryData.name}\n`;
            fieldValue += `**Priority**: ${priorityEmojis[ticket.priority] || '⚪'} ${ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}\n`;
            
            if (ticket.claimedBy) {
                let claimerName = ticket.claimedBy;
                try {
                    const claimerUser = await client.users.fetch(ticket.claimedBy);
                    claimerName = claimerUser.tag;
                } catch (error) {
                    console.log(`Could not fetch user ${ticket.claimedBy}`);
                }
                fieldValue += `**Claimed By**: ${claimerName}\n`;
            } else if (ticket.status === 'open') {
                fieldValue += `**Status**: Unclaimed\n`;
            }
            
            if (ticket.closedBy && ticket.status === 'closed') {
                let closerName = ticket.closedBy;
                try {
                    const closerUser = await client.users.fetch(ticket.closedBy);
                    closerName = closerUser.tag;
                } catch (error) {
                    console.log(`Could not fetch user ${ticket.closedBy}`);
                }
                fieldValue += `**Closed By**: ${closerName}\n`;
                fieldValue += `**Closed At**: ${moment(ticket.closedAt).format('MMM D, YYYY h:mm A')}\n`;
            }
            
            embed.addFields({
                name: `${ticket._id} (<#${ticket.channelId}>)`,
                value: fieldValue
            });
        }
        
        // Add a note if there are more tickets than we can display
        if (tickets.length > 25) {
            embed.setFooter({ text: `Showing 25 of ${tickets.length} tickets. Use specific filters to see others.` });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error fetching ticket list:', error);
        await interaction.editReply({
            content: 'There was an error fetching the ticket list. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket view subcommand
 */
async function handleTicketView(interaction, client) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketId = interaction.options.getString('ticket_id');
        
        // Get the ticket from database
        const ticket = await db.getTicketById(ticketId);
        if (!ticket) {
            return interaction.editReply({
                content: 'This ticket could not be found in the database.',
                ephemeral: true
            });
        }
        
        // Create embed with ticket details
        const embed = new EmbedBuilder()
            .setTitle(`Ticket Details: ${ticket._id}`)
            .setColor(ticket.status === 'open' ? '#3498DB' : '#E74C3C')
            .setTimestamp();
        
        // Format the creation timestamp
        const createdAt = moment(ticket.createdAt).format('MMM D, YYYY h:mm A');
        
        // Try to get creator username
        let creatorName = ticket.creatorId;
        try {
            const creatorUser = await client.users.fetch(ticket.creatorId);
            creatorName = creatorUser.tag;
        } catch (error) {
            console.log(`Could not fetch user ${ticket.creatorId}`);
        }
        
        // Get ticket category name
        const categoryData = client.config.ticketCategories.find(c => c.id === ticket.category) || { name: 'Unknown', emoji: '❓' };
        
        // Build description
        let description = `**Ticket ID**: ${ticket._id}\n`;
        description += `**Creator**: ${creatorName} (${ticket.creatorId})\n`;
        description += `**Created**: ${createdAt} (${moment(ticket.createdAt).fromNow()})\n`;
        description += `**Channel**: <#${ticket.channelId}>\n`;
        description += `**Category**: ${categoryData.emoji} ${categoryData.name}\n`;
        description += `**Status**: ${ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}\n`;
        description += `**Priority**: ${ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}\n`;
        
        if (ticket.claimedBy) {
            let claimerName = ticket.claimedBy;
            try {
                const claimerUser = await client.users.fetch(ticket.claimedBy);
                claimerName = claimerUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${ticket.claimedBy}`);
            }
            description += `**Claimed By**: ${claimerName} (${ticket.claimedBy})\n`;
            description += `**Claimed At**: ${moment(ticket.claimedAt).format('MMM D, YYYY h:mm A')}\n`;
        }
        
        if (ticket.closedBy) {
            let closerName = ticket.closedBy;
            try {
                const closerUser = await client.users.fetch(ticket.closedBy);
                closerName = closerUser.tag;
            } catch (error) {
                console.log(`Could not fetch user ${ticket.closedBy}`);
            }
            description += `**Closed By**: ${closerName} (${ticket.closedBy})\n`;
            description += `**Closed At**: ${moment(ticket.closedAt).format('MMM D, YYYY h:mm A')}\n`;
        }
        
        if (ticket.lastActivity) {
            description += `**Last Activity**: ${moment(ticket.lastActivity).format('MMM D, YYYY h:mm A')} (${moment(ticket.lastActivity).fromNow()})\n`;
        }
        
        embed.setDescription(description);
        
        // Add reason field
        if (ticket.reason) {
            embed.addFields({
                name: 'Reason',
                value: ticket.reason
            });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error viewing ticket details:', error);
        await interaction.editReply({
            content: 'There was an error fetching the ticket details. Please try again later.',
            ephemeral: true
        });
    }
}

/**
 * Handle ticket stats subcommand
 */
async function handleTicketStats(interaction, client) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        // Get all tickets from database
        const allTickets = await db.getAllTickets();
        
        if (allTickets.length === 0) {
            return interaction.editReply({
                content: 'There are no tickets to analyze.',
                ephemeral: true
            });
        }
        
        // Calculate various stats
        const openTickets = allTickets.filter(ticket => ticket.status === 'open');
        const closedTickets = allTickets.filter(ticket => ticket.status === 'closed');
        const unclaimedTickets = openTickets.filter(ticket => !ticket.claimedBy);
        
        // Calculate tickets by priority
        const highPriorityTickets = openTickets.filter(ticket => ticket.priority === 'high');
        const mediumPriorityTickets = openTickets.filter(ticket => ticket.priority === 'medium');
        const lowPriorityTickets = openTickets.filter(ticket => ticket.priority === 'low');
        
        // Calculate tickets by category
        const ticketsByCategory = {};
        allTickets.forEach(ticket => {
            if (!ticketsByCategory[ticket.category]) {
                ticketsByCategory[ticket.category] = 0;
            }
            ticketsByCategory[ticket.category]++;
        });
        
        // Calculate tickets created in the last 24 hours, 7 days, and 30 days
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const ticketsLast24Hours = allTickets.filter(ticket => new Date(ticket.createdAt) >= last24Hours);
        const ticketsLast7Days = allTickets.filter(ticket => new Date(ticket.createdAt) >= last7Days);
        const ticketsLast30Days = allTickets.filter(ticket => new Date(ticket.createdAt) >= last30Days);
        
        // Calculate average resolution time for closed tickets
        let totalResolutionTime = 0;
        let ticketsWithValidResolutionTime = 0;
        
        for (const ticket of closedTickets) {
            if (ticket.createdAt && ticket.closedAt) {
                const createdDate = new Date(ticket.createdAt);
                const closedDate = new Date(ticket.closedAt);
                const resolutionTime = closedDate - createdDate;
                
                totalResolutionTime += resolutionTime;
                ticketsWithValidResolutionTime++;
            }
        }
        
        let averageResolutionTime = 'N/A';
        if (ticketsWithValidResolutionTime > 0) {
            const averageResolutionMs = totalResolutionTime / ticketsWithValidResolutionTime;
            const averageResolutionHours = Math.floor(averageResolutionMs / (1000 * 60 * 60));
            const averageResolutionMinutes = Math.floor((averageResolutionMs % (1000 * 60 * 60)) / (1000 * 60));
            
            averageResolutionTime = `${averageResolutionHours}h ${averageResolutionMinutes}m`;
        }
        
        // Count tickets by creator
        const creatorCounts = {};
        for (const ticket of allTickets) {
            creatorCounts[ticket.creatorId] = (creatorCounts[ticket.creatorId] || 0) + 1;
        }
        
        // Find top ticket creators
        const topCreators = Object.entries(creatorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        // Format top creators
        const topCreatorsText = await Promise.all(topCreators.map(async ([userId, count]) => {
            try {
                const user = await client.users.fetch(userId);
                return `${user.tag}: ${count} tickets`;
            } catch {
                return `<@${userId}>: ${count} tickets`;
            }
        }));
        
        // Count tickets by handler (staff who closed them)
        const handlerCounts = {};
        for (const ticket of closedTickets) {
            if (ticket.closedBy) {
                handlerCounts[ticket.closedBy] = (handlerCounts[ticket.closedBy] || 0) + 1;
            }
        }
        
        // Find top ticket handlers
        const topHandlers = Object.entries(handlerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        // Format top handlers
        const topHandlersText = await Promise.all(topHandlers.map(async ([userId, count]) => {
            try {
                const user = await client.users.fetch(userId);
                return `${user.tag}: ${count} tickets`;
            } catch {
                return `<@${userId}>: ${count} tickets`;
            }
        }));
        
        // Create an embed with the statistics
        const embed = new EmbedBuilder()
            .setTitle('Ticket Statistics')
            .setColor('#9B59B6')
            .setDescription(`Statistics for all tickets.`)
            .addFields(
                { name: 'Total Tickets', value: allTickets.length.toString(), inline: true },
                { name: 'Open Tickets', value: openTickets.length.toString(), inline: true },
                { name: 'Closed Tickets', value: closedTickets.length.toString(), inline: true },
                { name: 'Unclaimed Tickets', value: unclaimedTickets.length.toString(), inline: true },
                { name: 'High Priority', value: highPriorityTickets.length.toString(), inline: true },
                { name: 'Medium Priority', value: mediumPriorityTickets.length.toString(), inline: true },
                { name: 'Low Priority', value: lowPriorityTickets.length.toString(), inline: true },
                { name: 'Last 24 Hours', value: ticketsLast24Hours.length.toString(), inline: true },
                { name: 'Last 7 Days', value: ticketsLast7Days.length.toString(), inline: true },
                { name: 'Last 30 Days', value: ticketsLast30Days.length.toString(), inline: true },
                { name: 'Avg. Resolution Time', value: averageResolutionTime, inline: true }
            )
            .setTimestamp();
        
        // Add tickets by category
        let categoryText = '';
        for (const [categoryId, count] of Object.entries(ticketsByCategory)) {
            const categoryData = client.config.ticketCategories.find(c => c.id === categoryId) || { name: 'Unknown', emoji: '❓' };
            categoryText += `${categoryData.emoji} ${categoryData.name}: ${count}\n`;
        }
        
        if (categoryText) {
            embed.addFields({ name: 'Tickets by Category', value: categoryText });
        }
        
        // Add top creators
        if (topCreatorsText.length > 0) {
            embed.addFields({ name: 'Top Ticket Creators', value: topCreatorsText.join('\n') });
        }
        
        // Add top handlers
        if (topHandlersText.length > 0) {
            embed.addFields({ name: 'Top Ticket Handlers', value: topHandlersText.join('\n') });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
        
    } catch (error) {
        console.error('Error fetching ticket statistics:', error);
        await interaction.editReply({
            content: 'There was an error fetching ticket statistics. Please try again later.',
            ephemeral: true
        });
    }
}