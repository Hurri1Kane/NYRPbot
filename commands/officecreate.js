// commands/officecreate.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, PermissionsBitField } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
data: new SlashCommandBuilder()
    .setName('officecreate')
    .setDescription('Create an Internal Affairs office')
    .addUserOption(option => 
        option.setName('user')
            .setDescription('The staff member for the office')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('reason')
            .setDescription('The reason for creating the office')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('evidence')
            .setDescription('Evidence for the case')
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
    const reason = interaction.options.getString('reason');
    const evidence = interaction.options.getString('evidence') || 'No evidence provided';
    
    // Get the target member
    const guild = interaction.guild;
    let targetMember;
    try {
        targetMember = await guild.members.fetch(targetUser.id);
    } catch (error) {
        return interaction.reply({
            content: 'The target user is not in the server.',
            ephemeral: true
        });
    }
    
    // Check if target is a staff member
    const isStaff = targetMember.roles.cache.has(staffRoles.staffTeam.id);
    
    if (!isStaff) {
        return interaction.reply({
            content: 'This command can only be used for staff members.',
            ephemeral: true
        });
    }
    
    // Check if we're trying to create an office for someone of a higher rank
    const targetRank = getHighestStaffRole(targetMember, staffRoles);
    const executorRank = getHighestStaffRole(interaction.member, staffRoles);
    
    if (targetRank && executorRank && getRankLevel(targetRank.key) > getRankLevel(executorRank.key)) {
        return interaction.reply({
            content: 'You cannot create an office for a staff member of a higher rank than you.',
            ephemeral: true
        });
    }
    
    try {
        // Create an office ID
        const officeId = `office-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
        
        // Create office channel
        const officeChannel = await guild.channels.create({
            name: `ia-office-${targetUser.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            type: 0, // Text channel
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone role
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: targetUser.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                },
                {
                    id: staffRoles.internalAffairsCategory.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                }
            ]
        });
        
        // Create office buttons
        const officeButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`office_close:${officeId}`)
                    .setLabel('Close Office')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`office_transcript:${officeId}`)
                    .setLabel('Generate Transcript')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        // Send initial message in office channel
        const embed = new EmbedBuilder()
            .setTitle(`Internal Affairs Office: ${officeId}`)
            .setColor('#FF5555')
            .setDescription(`Office created for ${targetUser.tag}`)
            .addFields(
                { name: 'Created By', value: interaction.user.tag, inline: true },
                { name: 'Created', value: new Date().toISOString(), inline: true },
                { name: 'Reason', value: reason },
                { name: 'Evidence', value: evidence }
            )
            .setFooter({ text: 'Internal Affairs can use the buttons below to manage this office.' });
        
        const officeMessage = await officeChannel.send({
            content: `<@${targetUser.id}> You have been summoned to the Internal Affairs Office.`,
            embeds: [embed],
            components: [officeButtons]
        });
        
        // Save office information to database
        const officeData = {
            _id: officeId,
            channelId: officeChannel.id,
            messageId: officeMessage.id,
            targetId: targetUser.id,
            creatorId: interaction.user.id,
            reason: reason,
            evidence: evidence,
            createdAt: new Date().toISOString(),
            status: 'open',
            closedBy: null,
            closedAt: null,
            outcome: null
        };
        
        await db.addOffice(officeData);
        
        // Reply to the interaction
        await interaction.reply({
            content: `Internal Affairs Office has been created for ${targetUser.tag}! Please check ${officeChannel}`,
            ephemeral: true
        });
        
        // Log the office creation
        const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
        if (staffLogChannel) {
            await staffLogChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Staff Action Log: IA Office Created')
                        .setColor('#FF5555')
                        .setDescription(`New Internal Affairs Office created for ${targetUser.tag} by ${interaction.user.tag}`)
                        .addFields(
                            { name: 'Office ID', value: officeId, inline: true },
                            { name: 'Channel', value: `<#${officeChannel.id}>`, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        }
        
        // Add audit log
        await db.addAuditLog({
            actionType: 'OFFICE_CREATED',
            userId: interaction.user.id,
            targetId: targetUser.id,
            details: {
                officeId: officeId,
                channelId: officeChannel.id,
                reason: reason
            }
        });
        
        // Try to DM the target user
        try {
            await targetUser.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Internal Affairs Notification')
                        .setColor('#FF5555')
                        .setDescription('You have been summoned to an Internal Affairs Office')
                        .addFields(
                            { name: 'Created By', value: interaction.user.tag },
                            { name: 'Reason', value: reason }
                        )
                        .setFooter({ text: 'Please check the Discord server for more information.' })
                ]
            });
        } catch (dmError) {
            console.log(`Could not DM user ${targetUser.id}:`, dmError.message);
            // Continue with the process even if the DM fails
        }
        
    } catch (error) {
        console.error('Error creating IA office:', error);
        await interaction.reply({
            content: 'There was an error creating the Internal Affairs Office. Please try again later.',
            ephemeral: true
        });
    }
}
};

// Helper function to get the highest staff role a user has
function getHighestStaffRole(member, staffRoles) {
// Define the rank order for the hierarchy (highest to lowest)
const rankOrder = [
    'director', 'deputyDirector', 'viceDeputyDirector', 'leadAssistantDirector', 'assistantDirector',
    'seniorManager', 'manager', 'trialManager',
    'leadStaffSupervisor', 'staffSupervisor', 'staffSupervisorInTraining',
    'internalAffairsDirector', 'internalAffairs', 'trialInternalAffairs',
    'headAdmin', 'seniorAdmin', 'admin', 'trialAdmin',
    'headModerator', 'seniorModerator', 'moderator', 'trialModerator'
];

// Find the highest rank
for (const rankKey of rankOrder) {
    const roleData = staffRoles[rankKey];
    if (roleData && member.roles.cache.has(roleData.id)) {
        return { key: rankKey, ...roleData };
    }
}

return null;
}

// Get the rank level based on role key
function getRankLevel(roleKey) {
const rankOrder = [
    'trialModerator', 'moderator', 'seniorModerator', 'headModerator',
    'trialAdmin', 'admin', 'seniorAdmin', 'headAdmin',
    'trialInternalAffairs', 'internalAffairs', 'internalAffairsDirector',
    'staffSupervisorInTraining', 'staffSupervisor', 'leadStaffSupervisor',
    'trialManager', 'manager', 'seniorManager',
    'assistantDirector', 'leadAssistantDirector', 'viceDeputyDirector', 'deputyDirector', 'director'
];

return rankOrder.indexOf(roleKey);
}