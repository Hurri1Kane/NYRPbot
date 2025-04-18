// commands/officeclose.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('officeclose')
        .setDescription('Close an Internal Affairs office with an outcome')
        .addStringOption(option => 
            option.setName('outcome')
                .setDescription('The outcome of the investigation')
                .setRequired(true)
                .addChoices(
                    { name: 'No Action Required', value: 'no_action' },
                    { name: 'Warning Issued', value: 'warning' },
                    { name: 'Infraction Created', value: 'infraction' },
                    { name: 'Case Dismissed', value: 'dismissed' },
                    { name: 'Referred to Higher Authority', value: 'referred' }
                ))
        .addStringOption(option => 
            option.setName('notes')
                .setDescription('Additional notes about the outcome')
                .setRequired(false)),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Internal Affairs or higher rank
        const hasPermission = interaction.member.roles.cache.some(role => 
            [staffRoles.internalAffairs.id, staffRoles.internalAffairsDirector.id, 
             staffRoles.highRank.id, staffRoles.seniorHighRank.id].includes(role.id)
        );
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be an Internal Affairs member or higher to close offices.',
                ephemeral: true
            });
        }
        
        // Check if we're in an office channel
        const channel = interaction.channel;
        const officeData = await db.getOfficeById(channel.id); // Looking up by channel ID
        
        if (!officeData) {
            return interaction.reply({
                content: 'This command can only be used in an Internal Affairs office channel.',
                ephemeral: true
            });
        }
        
        // Check if the office is already closed
        if (officeData.status !== 'open') {
            return interaction.reply({
                content: 'This office is already closed.',
                ephemeral: true
            });
        }
        
        const outcome = interaction.options.getString('outcome');
        const notes = interaction.options.getString('notes') || 'No additional notes provided.';
        
        try {
            // Generate a transcript first before closing
            const discordTranscripts = require('discord-html-transcripts');
            
            const transcript = await discordTranscripts.createTranscript(channel, {
                limit: -1, // No limit
                fileName: `transcript-office-${officeData._id}.html`,
                saveImages: true,
                footerText: `Transcript of Internal Affairs Office ${officeData._id}`,
                poweredBy: false
            });
            
            // Send transcript to the IA transcript channel
            const iaTranscriptChannel = client.channels.cache.get(client.config.channels.internalAffairsTranscript);
            if (iaTranscriptChannel) {
                await iaTranscriptChannel.send({
                    content: `Transcript for Internal Affairs Office ${officeData._id} (Closed with outcome: ${formatOutcome(outcome)})`,
                    files: [transcript]
                });
            }
            
            // Update office in database
            await db.updateOffice(officeData._id, {
                status: 'closed',
                closedBy: interaction.user.id,
                closedAt: new Date().toISOString(),
                outcome: outcome,
                notes: notes
            });
            
            // Create a closing embed
            const closingEmbed = new EmbedBuilder()
                .setTitle(`Internal Affairs Office Closed: ${officeData._id}`)
                .setColor('#55FF55')
                .setDescription(`This office has been closed by ${interaction.user.tag}`)
                .addFields(
                    { name: 'Target', value: `<@${officeData.targetId}>`, inline: true },
                    { name: 'Outcome', value: formatOutcome(outcome), inline: true },
                    { name: 'Notes', value: notes }
                )
                .setTimestamp();
            
            // Send closing message
            await interaction.reply({
                embeds: [closingEmbed],
                files: [transcript]
            });
            
            // Log the office closure
            const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
            if (staffLogChannel) {
                await staffLogChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Staff Action Log: IA Office Closed')
                            .setColor('#55FF55')
                            .setDescription(`Internal Affairs Office for <@${officeData.targetId}> has been closed.`)
                            .addFields(
                                { name: 'Office ID', value: officeData._id, inline: true },
                                { name: 'Closed By', value: interaction.user.tag, inline: true },
                                { name: 'Outcome', value: formatOutcome(outcome), inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            }
            
            // Add audit log entry
            await db.addAuditLog({
                actionType: 'OFFICE_CLOSED',
                userId: interaction.user.id,
                targetId: officeData.targetId,
                details: {
                    officeId: officeData._id,
                    channelId: channel.id,
                    outcome: outcome,
                    notes: notes
                }
            });
            
            // Wait 10 seconds and then ask if they want to delete the channel
            setTimeout(async () => {
                try {
                    // Only proceed if the channel still exists
                    if (client.channels.cache.has(channel.id)) {
                        const deleteRow = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId(`office_delete:${officeData._id}`)
                                    .setPlaceholder('What would you like to do with this channel?')
                                    .addOptions([
                                        { label: 'Keep Channel Open', value: 'keep', description: 'Keep this channel for reference' },
                                        { label: 'Delete in 24 Hours', value: 'delete_24h', description: 'Schedule deletion in 24 hours' },
                                        { label: 'Delete Now', value: 'delete_now', description: 'Delete this channel immediately' }
                                    ])
                            );
                        
                        await channel.send({
                            content: 'The office is now closed. What would you like to do with this channel?',
                            components: [deleteRow]
                        });
                    }
                } catch (error) {
                    console.error('Error sending deletion options:', error);
                }
            }, 10000);
            
        } catch (error) {
            console.error('Error closing office:', error);
            await interaction.reply({
                content: 'There was an error closing this office. Please try again later.',
                ephemeral: true
            });
        }
    }
};

// Helper function to format the outcome for display
function formatOutcome(outcome) {
    const outcomeMap = {
        'no_action': 'No Action Required',
        'warning': 'Warning Issued',
        'infraction': 'Infraction Created',
        'dismissed': 'Case Dismissed',
        'referred': 'Referred to Higher Authority'
    };
    
    return outcomeMap[outcome] || outcome;
}