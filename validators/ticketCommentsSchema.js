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
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        `);

        // Trigger to update updated_at automatically
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ticket_comments_updated_at') THEN
                    CREATE TRIGGER update_ticket_comments_updated_at
                    BEFORE UPDATE ON ticket_comments
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
                END IF;
            END
            $$;
        `);

        console.log("✅ Ticket Comments table ready");
    } catch (err) {
        console.error("❌ Failed to ensure ticket comments table", err);
        throw err;
    }
};

module.exports = { ensureTicketCommentsTable };
