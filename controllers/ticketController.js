const pool = require("../db");

// --- Ticket Operations ---

// Create Ticket
exports.createTicket = async (req, res) => {
    try {
        const { title, description, type, priority, project_id, assignee_id } = req.body;
        const reporter_id = req.user.id; // From authMiddleware

        const result = await pool.query(
            `INSERT INTO tickets (title, description, type, priority, project_id, reporter_id, assignee_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [title, description, type || 'Task', priority || 'Medium', project_id, reporter_id, assignee_id]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create ticket" });
    }
};

// Get All Tickets (with filtering)
exports.getTickets = async (req, res) => {
    try {
        const { project_id, assignee_id, status, type } = req.query;
        let query = `
            SELECT t.*, 
                   p.name as project_name,
                   rep.name as reporter_name,
                   assign.name as assignee_name
            FROM tickets t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users rep ON t.reporter_id = rep.id
            LEFT JOIN users assign ON t.assignee_id = assign.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (project_id) {
            query += ` AND t.project_id = $${paramIndex}`;
            params.push(project_id);
            paramIndex++;
        }
        if (assignee_id) {
            query += ` AND t.assignee_id = $${paramIndex}`;
            params.push(assignee_id);
            paramIndex++;
        }
        if (status) {
            query += ` AND t.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (type) {
             query += ` AND t.type = $${paramIndex}`;
             params.push(type);
             paramIndex++;
        }

        query += ` ORDER BY t.updated_at DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch tickets" });
    }
};

// Get Single Ticket Details
exports.getTicketById = async (req, res) => {
    try {
        const { id } = req.params;
        const ticketQuery = `
            SELECT t.*, 
                   p.name as project_name,
                   rep.name as reporter_name,
                   assign.name as assignee_name
            FROM tickets t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users rep ON t.reporter_id = rep.id
            LEFT JOIN users assign ON t.assignee_id = assign.id
            WHERE t.id = $1
        `;
        const ticketResult = await pool.query(ticketQuery, [id]);

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }

        // Fetch comments
        const commentsQuery = `
            SELECT c.*, u.name as user_name
            FROM ticket_comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.ticket_id = $1
            ORDER BY c.created_at ASC
        `;
        const commentsResult = await pool.query(commentsQuery, [id]);

        res.json({
            ...ticketResult.rows[0],
            comments: commentsResult.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch ticket details" });
    }
};

// Update Ticket
exports.updateTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, status, priority, assignee_id, type } = req.body;

        const result = await pool.query(
            `UPDATE tickets 
             SET title = COALESCE($1, title),
                 description = COALESCE($2, description),
                 status = COALESCE($3, status),
                 priority = COALESCE($4, priority),
                 assignee_id = COALESCE($5, assignee_id),
                 type = COALESCE($6, type)
             WHERE id = $7
             RETURNING *`,
            [title, description, status, priority, assignee_id, type, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update ticket" });
    }
};

// Delete Ticket
exports.deleteTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM tickets WHERE id = $1 RETURNING *", [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        res.json({ message: "Ticket deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete ticket" });
    }
};

// --- Comment Operations ---

// Add Comment
exports.addComment = async (req, res) => {
    try {
        const { id } = req.params; // ticket_id
        const { content } = req.body;
        const user_id = req.user.id;

        const result = await pool.query(
            `INSERT INTO ticket_comments (ticket_id, user_id, content)
             VALUES ($1, $2, $3)
             RETURNING *, (SELECT name FROM users WHERE id = $2) as user_name`,
            [id, user_id, content]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to add comment" });
    }
};
// Update Comment
exports.updateComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { content } = req.body;
        const user_id = req.user.id;

        // Verify ownership
        const commentResult = await pool.query(
            "SELECT * FROM ticket_comments WHERE id = $1",
            [commentId]
        );

        if (commentResult.rows.length === 0) {
            return res.status(404).json({ error: "Comment not found" });
        }

        if (commentResult.rows[0].user_id !== user_id) {
            return res.status(403).json({ error: "Unauthorized to edit this comment" });
        }

        const result = await pool.query(
            `UPDATE ticket_comments 
             SET content = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *, (SELECT name FROM users WHERE id = user_id) as user_name`,
            [content, commentId]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update comment" });
    }
};
