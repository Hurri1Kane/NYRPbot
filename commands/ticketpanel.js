// commands/ticketpanel.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketpanel')
        .setDescription('Create a support ticket panel')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('Channel to create the ticket panel in (defaults to current channel)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('title')
                .setDescription('Title for the ticket panel')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('description')
                .setDescription('Description for the ticket panel')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has staff team role or above
        const hasPermission = interaction.member.roles.cache.has(staffRoles.staffTeam.id);
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be a staff member to create ticket panels.',
                ephemeral: true
            });
        }
        
        // Get options
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const panelTitle = interaction.options.getString('title') || 'Support Tickets';
        const panelDescription = interaction.options.getString('description') || 
            'Need assistance? Click one of the buttons below to create a support ticket. Our staff team will be with you as soon as possible.';

        // Get ticket categories from config
        const ticketCategories = client.config.ticketCategories;
        
        try {
            // Create panel embed
            const panelEmbed = new EmbedBuilder()
                .setTitle(panelTitle)
                .setDescription(panelDescription)
                .setColor('#3498DB')
                .setFooter({ text: 'NYRP Support System' })
                .setTimestamp();
            
            // Create buttons for each ticket category
            const buttons = [];
            
            for (const category of ticketCategories) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`ticket_create:${category.id}`)
                        .setLabel(category.name)
                        .setEmoji(category.emoji)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            
            // Arrange buttons in rows (maximum 5 buttons per row)
            const rows = [];
            for (let i = 0; i < buttons.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                rows.push(row);
            }
            
            // Send the panel
            await targetChannel.send({
                embeds: [panelEmbed],
                components: rows
            });
            
            // Confirm to the user
            await interaction.reply({
                content: `Ticket panel created in ${targetChannel}!`,
                ephemeral: true
            });
            
            // Log the action
            const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
            if (staffLogChannel) {
                await staffLogChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Staff Action Log: Ticket Panel Created')
                            .setColor('#3498DB')
                            .setDescription(`${interaction.user.tag} created a new ticket panel`)
                            .addFields(
                                { name: 'Channel', value: `<#${targetChannel.id}>`, inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            }
            
            // Add audit log
            await db.addAuditLog({
                actionType: 'TICKET_PANEL_CREATED',
                userId: interaction.user.id,
                details: {
                    channelId: targetChannel.id
                }
            });
            
        } catch (error) {
            console.error('Error creating ticket panel:', error);
            await interaction.reply({
                content: 'There was an error creating the ticket panel. Please try again later.',
                ephemeral: true
            });
        }
    }
};