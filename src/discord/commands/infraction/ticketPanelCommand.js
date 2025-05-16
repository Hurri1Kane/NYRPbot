// src/discord/commands/infraction/ticketPanelCommand.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { PERMISSION_PRESETS } = require('../../utils/permissionManager');
const logger = require('../../../utils/logger');
const { safeReply } = require('../../events/interactionCreate');
const ticketCommand = require('./ticketCommand'); // Import the ticket command to reuse its button handlers

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
  
  // Reuse button handlers from ticketCommand
  buttons: ticketCommand.buttons,
  
  // Reuse modal handlers from ticketCommand
  modals: ticketCommand.modals,
  
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
          { 
            name: 'General Support (TA+)', 
            value: 'For General Questions, redeem purchases and giveaway prizes.' 
          },
          { 
            name: 'Staff Report (TIA+)', 
            value: 'Report a Staff Member of New York Roleplay, remember to have evidence!' 
          },
          { 
            name: 'In-game Report (TM+)', 
            value: 'To show evidence for in-game violations.' 
          },
          { 
            name: 'Ownership Support (VDD+)', 
            value: 'Partnerships, Paid Ads, High ranking Staff Report, Important Inquiries.' 
          }
        )
        .setFooter({ text: 'NYRP Staff Management System' })
        .setTimestamp();
      
      // Create buttons
      const buttonRow1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:create:General Support')
            .setLabel('General Support')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
          new ButtonBuilder()
            .setCustomId('ticket:create:Staff Report')
            .setLabel('Staff Report')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛡️')
        );

      const buttonRow2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:create:In-game Report')
            .setLabel('In-game Report')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎮'),
          new ButtonBuilder()
            .setCustomId('ticket:create:Ownership Support')
            .setLabel('Ownership Support')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👑')
        );
      
      // Send the panel
      await targetChannel.send({
        embeds: [ticketEmbed],
        components: [buttonRow1, buttonRow2]
      });
      
      // Send confirmation
      await interaction.editReply({
        content: 'Ticket panel has been created successfully!',
        ephemeral: true
      });
    } catch (error) {
      logger.error(`Error creating ticket panel: ${error.message}`);
      await interaction.editReply({
        content: 'An error occurred while creating the ticket panel.',
        ephemeral: true
      });
    }
  }
};