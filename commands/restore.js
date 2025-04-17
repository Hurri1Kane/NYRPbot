// commands/restore.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/dbHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restore')
        .setDescription('Restore roles for a suspended staff member')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The staff member to restore roles for')
                .setRequired(true)),
    async execute(interaction, client) {
        // Get staff roles configuration
        const staffRoles = client.config.staffRoles;
        
        // Check if user has Director rank
        const hasPermission = interaction.member.roles.cache.has(staffRoles.director.id);
        
        if (!hasPermission) {
            return interaction.reply({
                content: 'You must be a Director to use this command.',
                ephemeral: true
            });
        }
        
        const targetUser = interaction.options.getUser('user');
        
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
        
        // Check if the user is currently suspended
        const isSuspended = targetMember.roles.cache.has(staffRoles.suspended.id);
        
        if (!isSuspended) {
            return interaction.reply({
                content: 'This user is not currently suspended.',
                ephemeral: true
            });
        }
        
        try {
            // Find active suspension infractions for this user
            const activeInfractions = await db.getUserInfractions(targetUser.id);
            const suspensionInfractions = activeInfractions.filter(i => 
                i.status === 'active' && i.type.startsWith('suspension_')
            );
            
            if (suspensionInfractions.length === 0) {
                return interaction.reply({
                    content: 'No active suspension infractions found for this user in the database.',
                    ephemeral: true
                });
            }
            
            // Start by removing the suspended role
            await targetMember.roles.remove(staffRoles.suspended.id);
            
            // Track how many infractions were processed and if any failed
            let processedCount = 0;
            let failedCount = 0;
            
            // Process each suspension infraction
            for (const infraction of suspensionInfractions) {
                try {
                    // Restore previous roles if they exist
                    if (infraction.previousRoles && infraction.previousRoles.length > 0) {
                        for (const roleId of infraction.previousRoles) {
                            try {
                                await targetMember.roles.add(roleId);
                            } catch (roleError) {
                                console.error(`Error adding role ${roleId} to ${targetMember.id}:`, roleError);
                            }
                        }
                    }
                    
                    // Update infraction status
                    await db.updateInfractionStatus(infraction._id, 'manually_completed', {
                        manuallyCompletedBy: interaction.user.id,
                        manuallyCompletedAt: new Date().toISOString()
                    });
                    
                    processedCount++;
                } catch (infractionError) {
                    console.error(`Error processing infraction ${infraction._id}:`, infractionError);
                    failedCount++;
                }
            }
            
            // Create a response message based on results
            let responseContent;
            if (processedCount > 0 && failedCount === 0) {
                responseContent = `Successfully restored roles for ${targetUser.tag}. ${processedCount} suspension(s) marked as completed.`;
            } else if (processedCount > 0 && failedCount > 0) {
                responseContent = `Partially restored roles for ${targetUser.tag}. ${processedCount} suspension(s) processed, but ${failedCount} failed.`;
            } else {
                responseContent = `Failed to restore roles for ${targetUser.tag}. Please check the logs for more information.`;
            }
            
            await interaction.reply({
                content: responseContent,
                ephemeral: true
            });
            
            // Log the restoration
            const staffLogChannel = client.channels.cache.get(client.config.channels.staffLog);
            if (staffLogChannel) {
                await staffLogChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Staff Action Log: Manual Role Restoration')
                            .setColor('#AAFFAA')
                            .setDescription(`Roles for ${targetUser.tag} were manually restored by ${interaction.user.tag}`)
                            .addFields(
                                { name: 'Suspensions Completed', value: processedCount.toString(), inline: true },
                                { name: 'Failed Operations', value: failedCount.toString(), inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            }
            
            // Add audit log
            await db.addAuditLog({
                actionType: 'MANUAL_ROLE_RESTORATION',
                userId: interaction.user.id,
                targetId: targetUser.id,
                details: {
                    suspensionsProcessed: processedCount,
                    suspensionsFailed: failedCount
                }
            });
            
            // Try to notify the user
            try {
                await targetUser.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Suspension Manually Completed')
                            .setColor('#AAFFAA')
                            .setDescription('Your suspension has been manually completed by a Director and your roles have been restored.')
                            .addFields(
                                { name: 'Restored By', value: interaction.user.tag }
                            )
                            .setTimestamp()
                    ]
                });
            } catch (dmError) {
                console.log(`Could not DM user ${targetUser.id}:`, dmError.message);
            }
            
        } catch (error) {
            console.error('Error restoring roles:', error);
            await interaction.reply({
                content: 'There was an error restoring roles. Please check the logs for more information.',
                ephemeral: true
            });
        }
    }
};