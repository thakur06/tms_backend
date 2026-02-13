const pool = require("../db");

const ensureTicketCommentsTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ticket_comments (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                content TEXT NOT NULL,
                attachment_url TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log("✅ Ticket Comments table ready");
    } catch (err) {
        console.error("❌ Failed to ensure ticket comments table", err);
        throw err;
    }
};

module.exports = { ensureTicketCommentsTable };
