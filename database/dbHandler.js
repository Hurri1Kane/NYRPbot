// database/dbHandler.js
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

/**
 * MongoDB Database Handler for NYRP Staff Management Bot
 * Handles all database operations for infractions, tickets, offices, promotions, and audit logs
 */
class DatabaseHandler {
    constructor() {
        this.client = null;
        this.db = null;
        this.connected = false;
        this.collectionNames = {
            infractions: 'infractions',
            tickets: 'tickets',
            offices: 'offices',
            promotions: 'promotions',
            auditLogs: 'audit_logs',
            staffMembers: 'staff_members'
        };
    }

    /**
     * Initialize the database connection
     * @returns {Promise<boolean>} - True if connected successfully
     */
    async initializeDatabase() {
        try {
            // Get MongoDB connection details from environment variables
            const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
            const dbName = process.env.DB_NAME || 'nyrp_staff_bot';
            
            // Connect to MongoDB
            this.client = new MongoClient(uri, {
                maxPoolSize: 10, // Maximum number of connections in the connection pool
                minPoolSize: 5,  // Minimum number of connections in the connection pool
                connectTimeoutMS: 30000, // Connection timeout of 30 seconds
                socketTimeoutMS: 45000,  // Socket timeout of 45 seconds
                serverSelectionTimeoutMS: 60000 // Server selection timeout
            });
            
            await this.client.connect();
            console.log('Connected to MongoDB successfully');
            
            // Get database reference
            this.db = this.client.db(dbName);
            this.connected = true;
            
            // Create indexes for better performance
            await this._createIndexes();
            
            return true;
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            this.connected = false;
            throw error;
        }
    }
    
    /**
     * Create database indexes for performance optimization
     * @private
     */
    async _createIndexes() {
        try {
            // Infractions indexes
            await this.db.collection(this.collectionNames.infractions).createIndex({ userId: 1 });
            await this.db.collection(this.collectionNames.infractions).createIndex({ status: 1 });
            await this.db.collection(this.collectionNames.infractions).createIndex({ timestamp: -1 });
            await this.db.collection(this.collectionNames.infractions).createIndex({ type: 1 });
            
            // Tickets indexes
            await this.db.collection(this.collectionNames.tickets).createIndex({ status: 1 });
            await this.db.collection(this.collectionNames.tickets).createIndex({ creatorId: 1 });
            await this.db.collection(this.collectionNames.tickets).createIndex({ createdAt: -1 });
            await this.db.collection(this.collectionNames.tickets).createIndex({ channelId: 1 }, { unique: true });
            await this.db.collection(this.collectionNames.tickets).createIndex({ lastActivity: 1 });
            
            // Offices indexes
            await this.db.collection(this.collectionNames.offices).createIndex({ status: 1 });
            await this.db.collection(this.collectionNames.offices).createIndex({ targetId: 1 });
            await this.db.collection(this.collectionNames.offices).createIndex({ createdAt: -1 });
            await this.db.collection(this.collectionNames.offices).createIndex({ channelId: 1 }, { unique: true });
            
            // Promotions indexes
            await this.db.collection(this.collectionNames.promotions).createIndex({ staffId: 1 });
            await this.db.collection(this.collectionNames.promotions).createIndex({ timestamp: -1 });
            
            // Audit logs indexes
            await this.db.collection(this.collectionNames.auditLogs).createIndex({ timestamp: -1 });
            await this.db.collection(this.collectionNames.auditLogs).createIndex({ actionType: 1 });
            await this.db.collection(this.collectionNames.auditLogs).createIndex({ userId: 1 });
            
            // Staff members indexes
            await this.db.collection(this.collectionNames.staffMembers).createIndex({ userId: 1 }, { unique: true });
            
            console.log('Database indexes created successfully');
        } catch (error) {
            console.error('Error creating database indexes:', error);
            // Non-fatal error, continue with initialization
        }
    }
    
    /**
     * Close the database connection
     * @returns {Promise<void>}
     */
    async closeDatabase() {
        if (this.client) {
            await this.client.close();
            this.connected = false;
            console.log('MongoDB connection closed');
        }
    }
    
    /**
     * Check if database is connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }
    
    /**
     * Validate that an ObjectId is valid or convert a string to ObjectId
     * @param {string|ObjectId} id - The ID to validate or convert
     * @returns {ObjectId} - The ObjectId
     * @private
     */
    _validateId(id) {
        // If it's already an ObjectId, return it
        if (id instanceof ObjectId) return id;
        
        // If it's a string that looks like an ObjectId, convert it
        if (ObjectId.isValid(id)) return new ObjectId(id);
        
        // Otherwise, just return the original ID (for custom string IDs)
        return id;
    }
    
    // =========================================================================
    // Infractions Methods
    // =========================================================================
    
    /**
     * Add a new infraction to the database
     * @param {Object} infraction - The infraction data
     * @returns {Promise<string>} - The ID of the inserted infraction
     */
    async addInfraction(infraction) {
        try {
            // Set created timestamp if not already set
            if (!infraction.timestamp) {
                infraction.timestamp = new Date().toISOString();
            }
            
            // Set defaults for optional fields
            const infractionData = {
                status: 'pending_approval',
                ...infraction
            };
            
            const result = await this.db.collection(this.collectionNames.infractions).insertOne(infractionData);
            return infraction._id || result.insertedId.toString();
        } catch (error) {
            console.error('Error adding infraction:', error);
            throw error;
        }
    }
    
    /**
     * Update an infraction's status and additional details
     * @param {string|ObjectId} id - The infraction ID
     * @param {string} status - The new status
     * @param {Object} details - Additional fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     */
    async updateInfractionStatus(id, status, details = {}) {
        try {
            const updateData = {
                $set: { 
                    status, 
                    ...details,
                    updatedAt: new Date().toISOString()
                }
            };
            
            const result = await this.db.collection(this.collectionNames.infractions).updateOne(
                { _id: this._validateId(id) },
                updateData
            );
            
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating infraction status:', error);
            throw error;
        }
    }
    
    /**
     * Get an infraction by ID
     * @param {string|ObjectId} id - The infraction ID
     * @returns {Promise<Object|null>} - The infraction data
     */
    async getInfractionById(id) {
        try {
            return await this.db.collection(this.collectionNames.infractions).findOne(
                { _id: this._validateId(id) }
            );
        } catch (error) {
            console.error('Error getting infraction by ID:', error);
            throw error;
        }
    }
    
    /**
     * Get all infractions for a user
     * @param {string} userId - The user ID
     * @returns {Promise<Array>} - The user's infractions
     */
    async getUserInfractions(userId) {
        try {
            return await this.db.collection(this.collectionNames.infractions)
                .find({ userId })
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting user infractions:', error);
            throw error;
        }
    }
    
    /**
     * Get all infractions with optional limit
     * @param {number} limit - Maximum number of infractions to return (0 for all)
     * @returns {Promise<Array>} - The infractions
     */
    async getAllInfractions(limit = 0) {
        try {
            let query = this.db.collection(this.collectionNames.infractions)
                .find({})
                .sort({ timestamp: -1 });
                
            if (limit > 0) {
                query = query.limit(limit);
            }
            
            return await query.toArray();
        } catch (error) {
            console.error('Error getting all infractions:', error);
            throw error;
        }
    }
    
    /**
     * Get all active infractions
     * @returns {Promise<Array>} - The active infractions
     */
    async getActiveInfractions() {
        try {
            return await this.db.collection(this.collectionNames.infractions)
                .find({ status: 'active' })
                .toArray();
        } catch (error) {
            console.error('Error getting active infractions:', error);
            throw error;
        }
    }
    
    // =========================================================================
    // Tickets Methods
    // =========================================================================
    
    /**
     * Add a new ticket to the database
     * @param {Object} ticket - The ticket data
     * @returns {Promise<string>} - The ID of the inserted ticket
     */
    async addTicket(ticket) {
        try {
            // Set created timestamp if not already set
            if (!ticket.createdAt) {
                ticket.createdAt = new Date().toISOString();
            }
            
            // Set last activity to creation time if not specified
            if (!ticket.lastActivity) {
                ticket.lastActivity = ticket.createdAt;
            }
            
            const result = await this.db.collection(this.collectionNames.tickets).insertOne(ticket);
            return ticket._id || result.insertedId.toString();
        } catch (error) {
            console.error('Error adding ticket:', error);
            throw error;
        }
    }
    
    /**
     * Update a ticket
     * @param {string|ObjectId} id - The ticket ID
     * @param {Object} updates - The fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     */
    async updateTicket(id, updates) {
        try {
            const updateData = {
                $set: { 
                    ...updates,
                    updatedAt: new Date().toISOString()
                }
            };
            
            const result = await this.db.collection(this.collectionNames.tickets).updateOne(
                { _id: this._validateId(id) },
                updateData
            );
            
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating ticket:', error);
            throw error;
        }
    }
    
    /**
     * Get a ticket by ID
     * @param {string|ObjectId} id - The ticket ID
     * @returns {Promise<Object|null>} - The ticket data
     */
    async getTicketById(id) {
        try {
            // First try by _id field
            let ticket = await this.db.collection(this.collectionNames.tickets).findOne(
                { _id: this._validateId(id) }
            );
            
            // If not found, try by channelId (for convenience in commands)
            if (!ticket) {
                ticket = await this.db.collection(this.collectionNames.tickets).findOne(
                    { channelId: id }
                );
            }
            
            return ticket;
        } catch (error) {
            console.error('Error getting ticket by ID:', error);
            throw error;
        }
    }
    
    /**
     * Get all open tickets
     * @returns {Promise<Array>} - The open tickets
     */
    async getOpenTickets() {
        try {
            return await this.db.collection(this.collectionNames.tickets)
                .find({ status: { $ne: 'closed' } })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting open tickets:', error);
            throw error;
        }
    }
    
    /**
     * Get all active tickets for a specific user
     * @param {string} userId - The user ID
     * @returns {Promise<Array>} - The user's active tickets
     */
    async getUserActiveTickets(userId) {
        try {
            return await this.db.collection(this.collectionNames.tickets)
                .find({ 
                    creatorId: userId,
                    status: 'open'
                })
                .toArray();
        } catch (error) {
            console.error('Error getting user active tickets:', error);
            throw error;
        }
    }
    
    /**
     * Get all tickets by status
     * @param {string} status - The ticket status ('open', 'closed', etc.)
     * @returns {Promise<Array>} - The matching tickets
     */
    async getTicketsByStatus(status) {
        try {
            return await this.db.collection(this.collectionNames.tickets)
                .find({ status: status })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting tickets by status:', error);
            throw error;
        }
    }
    
    /**
     * Get tickets that have been inactive for a certain time
     * @param {number} hoursInactive - Hours of inactivity
     * @returns {Promise<Array>} - Inactive tickets
     */
    async getInactiveTickets(hoursInactive) {
        try {
            const cutoffTime = new Date();
            cutoffTime.setHours(cutoffTime.getHours() - hoursInactive);
            
            return await this.db.collection(this.collectionNames.tickets)
                .find({ 
                    status: 'open',
                    lastActivity: { $lt: cutoffTime.toISOString() }
                })
                .toArray();
        } catch (error) {
            console.error('Error getting inactive tickets:', error);
            throw error;
        }
    }
    
    /**
     * Update the last activity timestamp for a ticket
     * @param {string} ticketId - The ticket ID
     * @returns {Promise<boolean>} - True if updated successfully
     */
    async updateTicketActivity(ticketId) {
        try {
            const result = await this.db.collection(this.collectionNames.tickets).updateOne(
                { _id: this._validateId(ticketId) },
                { 
                    $set: { 
                        lastActivity: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }
                }
            );
            
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating ticket activity:', error);
            throw error;
        }
    }
    
    // =========================================================================
    // Offices Methods
    // =========================================================================
    
    /**
     * Add a new office to the database
     * @param {Object} office - The office data
     * @returns {Promise<string>} - The ID of the inserted office
     */
    async addOffice(office) {
        try {
            // Set created timestamp if not already set
            if (!office.createdAt) {
                office.createdAt = new Date().toISOString();
            }
            
            const result = await this.db.collection(this.collectionNames.offices).insertOne(office);
            return office._id || result.insertedId.toString();
        } catch (error) {
            console.error('Error adding office:', error);
            throw error;
        }
    }
    
    /**
     * Update an office
     * @param {string|ObjectId} id - The office ID
     * @param {Object} updates - The fields to update
     * @returns {Promise<boolean>} - True if updated successfully
     */
    async updateOffice(id, updates) {
        try {
            const updateData = {
                $set: { 
                    ...updates,
                    updatedAt: new Date().toISOString()
                }
            };
            
            const result = await this.db.collection(this.collectionNames.offices).updateOne(
                { _id: this._validateId(id) },
                updateData
            );
            
            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error updating office:', error);
            throw error;
        }
    }
    
    /**
     * Get an office by ID
     * @param {string|ObjectId} id - The office ID
     * @returns {Promise<Object|null>} - The office data
     */
    async getOfficeById(id) {
        try {
            // First try by _id field
            let office = await this.db.collection(this.collectionNames.offices).findOne(
                { _id: this._validateId(id) }
            );
            
            // If not found, try by channelId (for convenience in commands)
            if (!office) {
                office = await this.db.collection(this.collectionNames.offices).findOne(
                    { channelId: id }
                );
            }
            
            return office;
        } catch (error) {
            console.error('Error getting office by ID:', error);
            throw error;
        }
    }
    
    /**
     * Get all active offices
     * @returns {Promise<Array>} - The active offices
     */
    async getActiveOffices() {
        try {
            return await this.db.collection(this.collectionNames.offices)
                .find({ status: 'open' })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting active offices:', error);
            throw error;
        }
    }
    
    /**
     * Get all offices (both active and closed)
     * @returns {Promise<Array>} - All offices
     */
    async getAllOffices() {
        try {
            return await this.db.collection(this.collectionNames.offices)
                .find({})
                .sort({ createdAt: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting all offices:', error);
            throw error;
        }
    }
    
    // =========================================================================
    // Promotions Methods
    // =========================================================================
    
    /**
     * Add a new promotion to the database
     * @param {Object} promotion - The promotion data
     * @returns {Promise<string>} - The ID of the inserted promotion
     */
    async addPromotion(promotion) {
        try {
            // Set timestamp if not already set
            if (!promotion.timestamp) {
                promotion.timestamp = new Date().toISOString();
            }
            
            const result = await this.db.collection(this.collectionNames.promotions).insertOne(promotion);
            return promotion._id || result.insertedId.toString();
        } catch (error) {
            console.error('Error adding promotion:', error);
            throw error;
        }
    }
    
    /**
     * Get all promotions for a user
     * @param {string} userId - The user ID
     * @returns {Promise<Array>} - The user's promotions
     */
    async getPromotionsForUser(userId) {
        try {
            return await this.db.collection(this.collectionNames.promotions)
                .find({ staffId: userId })
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting promotions for user:', error);
            throw error;
        }
    }
    
    // =========================================================================
    // Audit Logs Methods
    // =========================================================================
    
    /**
     * Add a new audit log entry
     * @param {Object} log - The audit log data
     * @returns {Promise<string>} - The ID of the inserted log
     */
    async addAuditLog(log) {
        try {
            // Set timestamp if not already set
            const logData = {
                ...log,
                timestamp: log.timestamp || new Date().toISOString()
            };
            
            const result = await this.db.collection(this.collectionNames.auditLogs).insertOne(logData);
            return result.insertedId.toString();
        } catch (error) {
            console.error('Error adding audit log:', error);
            throw error;
        }
    }
    
    /**
     * Get recent audit logs
     * @param {number} limit - Maximum number of logs to return
     * @returns {Promise<Array>} - The audit logs
     */
    async getRecentAuditLogs(limit = 100) {
        try {
            return await this.db.collection(this.collectionNames.auditLogs)
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting recent audit logs:', error);
            throw error;
        }
    }
    
    /**
     * Get audit logs by user
     * @param {string} userId - The user ID
     * @param {number} limit - Maximum number of logs to return
     * @returns {Promise<Array>} - The user's audit logs
     */
    async getUserAuditLogs(userId, limit = 50) {
        try {
            return await this.db.collection(this.collectionNames.auditLogs)
                .find({ userId })
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting user audit logs:', error);
            throw error;
        }
    }
    
    /**
     * Get audit logs by action type
     * @param {string} actionType - The action type
     * @param {number} limit - Maximum number of logs to return
     * @returns {Promise<Array>} - The matching audit logs
     */
    async getAuditLogsByAction(actionType, limit = 50) {
        try {
            return await this.db.collection(this.collectionNames.auditLogs)
                .find({ actionType })
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting audit logs by action:', error);
            throw error;
        }
    }
    
    // =========================================================================
    // Staff Members Methods
    // =========================================================================
    
    /**
     * Add or update a staff member
     * @param {Object} staffMember - The staff member data
     * @returns {Promise<boolean>} - True if the operation was successful
     */
    async upsertStaffMember(staffMember) {
        try {
            // Ensure the staff member has a userId
            if (!staffMember.userId) {
                throw new Error('Staff member must have a userId');
            }
            
            // Update with upsert to create if not exists
            const result = await this.db.collection(this.collectionNames.staffMembers).updateOne(
                { userId: staffMember.userId },
                { 
                    $set: {
                        ...staffMember,
                        updatedAt: new Date().toISOString()
                    }
                },
                { upsert: true }
            );
            
            return result.modifiedCount > 0 || result.upsertedCount > 0;
        } catch (error) {
            console.error('Error upserting staff member:', error);
            throw error;
        }
    }
    
    /**
     * Get a staff member by user ID
     * @param {string} userId - The user ID
     * @returns {Promise<Object|null>} - The staff member data
     */
    async getStaffMemberByUserId(userId) {
        try {
            return await this.db.collection(this.collectionNames.staffMembers).findOne({ userId });
        } catch (error) {
            console.error('Error getting staff member by user ID:', error);
            throw error;
        }
    }
    
    /**
     * Get all staff members
     * @returns {Promise<Array>} - All staff members
     */
    async getAllStaffMembers() {
        try {
            return await this.db.collection(this.collectionNames.staffMembers)
                .find({})
                .toArray();
        } catch (error) {
            console.error('Error getting all staff members:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const dbHandler = new DatabaseHandler();
module.exports = dbHandler;