// src/discord/utils/transcriptGenerator.js
const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const ErrorHandler = require('../../utils/errorHandler');
const { channelConfig } = require('../../config/channels');

/**
 * Generate a transcript of a channel's messages
 * @param {Channel} channel - Discord channel to generate transcript from
 * @param {Object} contextData - Ticket or Office data for context
 * @returns {Promise<string>} URL or path to the transcript
 */
async function generateTranscript(channel, contextData) {
  try {
    // Determine the type (ticket or office)
    const isTicket = 'ticketId' in contextData;
    const isOffice = 'officeId' in contextData;
    
    if (!isTicket && !isOffice) {
      throw new Error('Invalid context data provided for transcript generation');
    }
    
    // Log starting transcript generation
    logger.info(`Starting transcript generation for ${isTicket ? 'ticket' : 'office'} ${isTicket ? contextData.ticketId : contextData.officeId}`);
    
    // Fetch messages from the channel
    const messages = await fetchMessages(channel);
    
    // Generate HTML content
    const html = generateHtml(messages, contextData, channel);
    
    // Determine where to save the transcript
    let transcriptChannelId;
    if (isTicket) {
      transcriptChannelId = channelConfig.transcripts[contextData.category];
      if (!transcriptChannelId) {
        logger.warn(`No transcript channel configured for ticket category: ${contextData.category}`);
        transcriptChannelId = channelConfig.transcripts['General Support']; // Fallback
      }
    } else if (isOffice) {
      transcriptChannelId = channelConfig.transcripts['Internal Affairs'];
    }
    
    // Save and send the transcript
    const transcriptUrl = await saveTranscript(html, channel, contextData, transcriptChannelId);
    
    logger.info(`Transcript successfully generated for ${isTicket ? 'ticket' : 'office'} ${isTicket ? contextData.ticketId : contextData.officeId}`);
    
    return transcriptUrl;
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(
      error, 
      `TranscriptGenerator:${contextData.ticketId || contextData.officeId}`
    );
    logger.error(`Error generating transcript: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
}

/**
 * Fetch messages from a channel
 * @param {Channel} channel - Discord channel
 * @returns {Promise<Array>} Array of messages
 */
async function fetchMessages(channel) {
  try {
    const messages = [];
    let lastId;
    let fetchedMessages;
    let fetchAttempts = 0;
    const maxAttempts = 5;
    
    // Fetch messages in batches of 100 (Discord limit)
    while (true) {
      try {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        
        fetchedMessages = await channel.messages.fetch(options);
        
        if (fetchedMessages.size === 0) break;
        
        messages.push(...fetchedMessages.values());
        lastId = fetchedMessages.last().id;
        
        // If we have fetched less than 100 messages, we're done
        if (fetchedMessages.size < 100) break;
        
        // Reset attempt counter on successful fetch
        fetchAttempts = 0;
      } catch (error) {
        fetchAttempts++;
        logger.warn(`Error fetching messages (attempt ${fetchAttempts}): ${error.message}`);
        
        if (fetchAttempts >= maxAttempts) {
          throw new Error(`Failed to fetch messages after ${maxAttempts} attempts`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, fetchAttempts)));
      }
    }
    
    // Sort by timestamp (oldest first)
    return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  } catch (error) {
    logger.error(`Error in fetchMessages: ${error.message}`);
    throw error;
  }
}

/**
 * Generate HTML transcript
 * @param {Array} messages - Array of Discord messages
 * @param {Object} contextData - Ticket or Office data for context
 * @param {Channel} channel - Discord channel
 * @returns {string} HTML content
 */
function generateHtml(messages, contextData, channel) {
  try {
    const isTicket = 'ticketId' in contextData;
    const isOffice = 'officeId' in contextData;
    
    let title = '';
    let subtitle = '';
    
    if (isTicket) {
      title = `Ticket: ${contextData.ticketId}`;
      subtitle = `Category: ${contextData.category} | Subject: ${contextData.subject}`;
    } else if (isOffice) {
      title = `Internal Affairs Office: ${contextData.officeId}`;
      subtitle = `Target: ${contextData.targetUser.username} | Created by: ${contextData.createdBy.username}`;
    }
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          .message { margin-bottom: 15px; padding: 10px; border-radius: 5px; background-color: #f5f5f5; }
          .author { font-weight: bold; margin-bottom: 5px; }
          .timestamp { font-size: 0.8em; color: #666; margin-bottom: 5px; }
          .content { margin-left: 10px; word-wrap: break-word; }
          .embed { border-left: 4px solid #4CAF50; padding-left: 10px; margin: 5px 0; background-color: #f0f0f0; }
          .attachment { margin-top: 5px; }
          img { max-width: 400px; max-height: 300px; }
          .system-message { background-color: #e6f7ff; }
          .deleted-message { background-color: #ffebee; text-decoration: line-through; opacity: 0.7; }
          .edited-message::after { content: " (edited)"; font-size: 0.8em; color: #666; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .footer { text-align: center; margin-top: 20px; font-size: 0.8em; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p>${subtitle}</p>
          <p>Channel: ${channel.name} | Generated: ${new Date().toLocaleString()}</p>
        </div>
    `;
    
    // Add messages
    for (const message of messages) {
      const isSystem = message.author.bot && message.author.id === channel.client.user.id;
      const messageClass = isSystem ? 'message system-message' : 'message';
      const isEdited = message.editedTimestamp !== null;
      const messageClassWithEdited = isEdited ? `${messageClass} edited-message` : messageClass;
      
      html += `
        <div class="${messageClassWithEdited}" id="msg-${message.id}">
          <div class="author">${escapeHtml(message.author.username)}${message.author.bot ? ' [BOT]' : ''}</div>
          <div class="timestamp">${message.createdAt.toLocaleString()}</div>
          <div class="content">${formatMessageContent(message)}</div>
      `;
      
      // Add embeds
      if (message.embeds.length > 0) {
        for (const embed of message.embeds) {
          html += `<div class="embed">`;
          
          if (embed.title) {
            html += `<div><strong>${escapeHtml(embed.title)}</strong></div>`;
          }
          
          if (embed.description) {
            html += `<div>${formatContent(embed.description)}</div>`;
          }
          
          // Add fields
          if (embed.fields && embed.fields.length > 0) {
            for (const field of embed.fields) {
              html += `<div><strong>${escapeHtml(field.name)}:</strong> ${formatContent(field.value)}</div>`;
            }
          }
          
          html += `</div>`;
        }
      }
      
      // Add attachments
      if (message.attachments.size > 0) {
        html += `<div class="attachments">`;
        for (const [id, attachment] of message.attachments) {
          const isImage = attachment.contentType && attachment.contentType.startsWith('image/');
          
          if (isImage) {
            html += `<div class="attachment"><img src="${attachment.url}" alt="Attachment" /></div>`;
          } else {
            html += `<div class="attachment"><a href="${attachment.url}" target="_blank">${escapeHtml(attachment.name || 'Attachment')}</a></div>`;
          }
        }
        html += `</div>`;
      }
      
      html += `</div>`;
    }
    
    // Add footer
    html += `
        <div class="footer">
          <p>Generated on ${new Date().toLocaleString()} | Total Messages: ${messages.length}</p>
          <p>NYRP Staff Management Bot Transcript System</p>
        </div>
      </body>
      </html>
    `;
    
    return html;
  } catch (error) {
    logger.error(`Error in generateHtml: ${error.message}`);
    throw error;
  }
}

/**
 * Format message content for HTML
 */
function formatMessageContent(message) {
  let content = message.content || '';
  
  if (!content) {
    return '<em>(No text content)</em>';
  }
  
  return formatContent(content);
}

/**
 * Format text content with Discord markdown
 */
function formatContent(content) {
  if (!content) return '';
  
  // Escape HTML entities
  content = escapeHtml(content);
  
  // Convert line breaks to <br>
  content = content.replace(/\n/g, '<br>');
  
  // Format code blocks
  content = content.replace(/```(\w+)?\n([\s\S]+?)\n```/g, '<pre><code>$2</code></pre>');
  
  // Format inline code
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Format bold text
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Format italic text
  content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  content = content.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Format underline
  content = content.replace(/\_\_([^_]+)\_\_/g, '<u>$1</u>');
  
  // Format strikethrough
  content = content.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  
  // Format user mentions
  content = content.replace(/<@!?(\d+)>/g, '<span class="mention">@User</span>');
  
  // Format channel mentions
  content = content.replace(/<#(\d+)>/g, '<span class="mention">#channel</span>');
  
  // Format role mentions
  content = content.replace(/<@&(\d+)>/g, '<span class="mention">@role</span>');
  
  // Format URLs
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  content = content.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
  
  return content;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Save transcript and post to transcript channel
 */
async function saveTranscript(html, channel, contextData, transcriptChannelId) {
  try {
    const isTicket = 'ticketId' in contextData;
    const isOffice = 'officeId' in contextData;
    
    const id = isTicket ? contextData.ticketId : contextData.officeId;
    const filename = `${id.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.html`;
    
    // If we have a transcript channel ID, post there
    let messageUrl = null;
    if (transcriptChannelId) {
      try {
        const transcriptChannel = await channel.guild.channels.fetch(transcriptChannelId);
        
        if (transcriptChannel) {
          const attachment = Buffer.from(html);
          
          const embed = new EmbedBuilder()
            .setColor(isTicket ? '#0099ff' : '#800080')
            .setTitle(`Transcript: ${id}`)
            .setDescription(`Transcript for ${isTicket ? 'ticket' : 'office'} ${id}`)
            .addFields(
              { name: 'Channel', value: channel.name, inline: true },
              { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            );
          
          if (isTicket) {
            embed.addFields(
              { name: 'Category', value: contextData.category, inline: true },
              { name: 'Creator', value: contextData.creator.username, inline: true }
            );
          } else if (isOffice) {
            embed.addFields(
              { name: 'Target', value: contextData.targetUser.username, inline: true },
              { name: 'Created By', value: contextData.createdBy.username, inline: true }
            );
          }
          
          try {
            const message = await transcriptChannel.send({
              embeds: [embed],
              files: [{
                attachment,
                name: filename
              }]
            });
            
            // Return the URL of the transcript message
            messageUrl = message.url;
            logger.info(`Transcript posted to channel ${transcriptChannel.name} (${transcriptChannel.id})`);
            return messageUrl;
          } catch (sendError) {
            // If send fails (e.g., due to file size), try with just the embed
            logger.warn(`Error sending transcript attachment: ${sendError.message}`);
            
            // Add a note about the failure
            embed.addFields({
              name: 'Note',
              value: 'Transcript file was too large to attach.'
            });
            
            const message = await transcriptChannel.send({ embeds: [embed] });
            messageUrl = message.url;
            return messageUrl;
          }
        }
      } catch (channelError) {
        const errorId = ErrorHandler.handleBackgroundError(
          channelError,
          `TranscriptGenerator:postTranscript:${id}`
        );
        logger.error(`Error posting transcript to channel: ${channelError.message} (Error ID: ${errorId})`);
      }
    }
    
    // Return a placeholder if we couldn't post to a channel
    return "No transcript URL available";
  } catch (error) {
    const errorId = ErrorHandler.handleBackgroundError(
      error,
      `TranscriptGenerator:saveTranscript`
    );
    logger.error(`Error saving transcript: ${error.message} (Error ID: ${errorId})`);
    throw error;
  }
}

module.exports = { generateTranscript };