// handlers/interactionHelper.js
/**
 * Helper utility for safely handling Discord.js interactions without hitting
 * "InteractionAlreadyReplied" errors
 */

/**
 * Creates a safe interaction wrapper that tracks interaction state and prevents errors
 * @param {Object} interaction Discord.js Interaction object
 * @returns {Object} Wrapper with safe methods for interaction responses
 */
function createSafeInteractionHelper(interaction) {
    // Track response state internally
    let hasResponded = false;
    let hasDeferred = false;
    let shouldFollowUp = false;
    
    // Only count these as "responded" if our wrapper initiated them
    // Otherwise use Discord.js's built-in state tracking
    if (interaction.deferred) hasDeferred = true;
    if (interaction.replied) shouldFollowUp = true;
    
    return {
        /**
         * Safely send a response to an interaction, automatically handling its state
         * @param {Object} options Response options (content, embeds, components, etc.)
         * @returns {Promise<Object>} Discord.js response object or null if error
         */
        async send(options) {
            try {
                // If we've already responded with a message or Discord.js shows it as replied
                if (shouldFollowUp || interaction.replied) {
                    return await interaction.followUp(options);
                }
                // If we've deferred the reply or Discord.js shows it as deferred
                else if (hasDeferred || interaction.deferred) {
                    hasResponded = true;
                    return await interaction.editReply(options);
                }
                // Fresh interaction, no response yet
                else {
                    hasResponded = true;
                    return await interaction.reply(options);
                }
            } catch (error) {
                console.error('Error sending interaction response:', error);
                // Try one more time with followUp as a last resort
                try {
                    return await interaction.followUp(options);
                } catch (followUpError) {
                    console.error('Final attempt to respond also failed:', followUpError);
                    return null;
                }
            }
        },
        
        /**
         * Safely update an interaction response (for components like buttons/selects)
         * @param {Object} options Response options to update with
         * @returns {Promise<Object>} Discord.js response object or null if error
         */
        async update(options) {
            try {
                if (interaction.replied || interaction.deferred) {
                    console.warn('Attempted to update an interaction that was already replied or deferred - using editReply instead');
                    return await interaction.editReply(options);
                } else {
                    hasResponded = true;
                    return await interaction.update(options);
                }
            } catch (error) {
                console.error('Error updating interaction:', error);
                
                // If update fails, try to use another response method as fallback
                try {
                    if (interaction.replied || interaction.deferred) {
                        return await interaction.editReply(options);
                    } else {
                        return await interaction.reply(options);
                    }
                } catch (fallbackError) {
                    console.error('Fallback response also failed:', fallbackError);
                    return null;
                }
            }
        },
        
        /**
         * Safely defer an interaction reply
         * @param {Object} options Defer options (typically {ephemeral: boolean})
         * @returns {Promise<Object>} Discord.js response object or null if error
         */
        async defer(options = { ephemeral: false }) {
            try {
                if (!hasResponded && !hasDeferred && !interaction.replied && !interaction.deferred) {
                    hasDeferred = true;
                    return await interaction.deferReply(options);
                } else {
                    console.warn('Attempted to defer an interaction that was already responded to');
                    return null;
                }
            } catch (error) {
                console.error('Error deferring interaction:', error);
                return null;
            }
        },
        
        /**
         * Safely defer an update to an interaction (for component interactions)
         * @returns {Promise<Object>} Discord.js response object or null if error
         */
        async deferUpdate() {
            try {
                if (!hasResponded && !hasDeferred && !interaction.replied && !interaction.deferred) {
                    hasDeferred = true;
                    return await interaction.deferUpdate();
                } else {
                    console.warn('Attempted to defer update on an interaction that was already responded to');
                    return null;
                }
            } catch (error) {
                console.error('Error deferring interaction update:', error);
                return null;
            }
        },
        
        /**
         * Mark this interaction as requiring followUp for future responses
         */
        setFollowUp() {
            shouldFollowUp = true;
        },
        
        /**
         * Check if the interaction has been responded to in any way
         * @returns {boolean} Whether the interaction has been responded to
         */
        hasResponded() {
            return hasResponded || hasDeferred || interaction.replied || interaction.deferred;
        },
        
        /**
         * Get the raw interaction object
         * @returns {Object} The original Discord.js interaction object
         */
        getInteraction() {
            return interaction;
        }
    };
}

module.exports = {
    createSafeInteractionHelper
};