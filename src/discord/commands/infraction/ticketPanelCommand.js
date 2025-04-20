// src/discord/commands/infraction/ticketPanelCommand.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PERMISSION_PRESETS } = require('../../utils/permissionManager');
const logger = require('../../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Creates a panel for users to open tickets')
    .addChannelOption(option => 
      option
        .setName('channel')
        .setDescription('The channel to send the ticket panel to (defaults to current channel)')
        .setRequired(false)
    )
    .addStringOption(option => 
      option
        .setName('title')
        .setDescription('The title of the ticket panel')
        .setRequired(false)
    )
    .addStringOption(option => 
      option
        .setName('description')
        .setDescription('The description of the ticket panel')
        .setRequired(false)
    ),
  
  // Only administrators or higher can deploy ticket panels
  permissions: PERMISSION_PRESETS.ADMINISTRATOR_PLUS,
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Get options
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const title = interaction.options.getString('title') || 'Support Tickets';
      const description = interaction.options.getString('description') || 
        'Click one of the buttons below to create a support ticket. Our staff team will assist you as soon as possible.';
      
      // Create the embed
      const ticketEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(title)
        .setDescription(description)
        .addFields(
          { name: 'General Support', value: 'For general questions, bug reports, or other non-urgent issues.' },
          { name: 'In-Game Reports', value: 'For reporting in-game issues, rule violations, or player concerns.' },
          { name: 'Staff Reports', value: 'For reporting staff members or issues with staff.' }
        )
        .setFooter({ text: 'NYRP Staff Management System' })
        .setTimestamp();
      
      // Create buttons
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:create:General Support')
            .setLabel('General Support')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setCustomId('ticket:create:In-Game Reports')
            .setLabel('In-Game Reports')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎮'),
          new ButtonBuilder()
            .setCustomId('ticket:create:Staff Reports')
            .setLabel('Staff Reports')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛡️')
        );
      
      // Send the panel
      await targetChannel.send({
        embeds: [ticketEmbed],
        components: [buttonRow]
      });
      
      // Confirm to user
      await interaction.editReply({
        content: `Ticket panel successfully deployed to ${targetChannel}!`,
        ephemeral: true
      });
      
      logger.info(`Ticket panel deployed to ${targetChannel.name} (${targetChannel.id}) by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error deploying ticket panel: ${error.message}`);
      await interaction.editReply({
        content: 'An error occurred while deploying the ticket panel. Please check the logs.',
        ephemeral: true
      });
    }
  }
};