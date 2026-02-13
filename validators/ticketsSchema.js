const pool = require("../db");

const ensureTicketsTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                type VARCHAR(50) CHECK (type IN ('Bug', 'Feature', 'Support', 'Task')) DEFAULT 'Task',
                status VARCHAR(50) CHECK (status IN ('Open', 'In Progress', 'Under Review', 'Done', 'Cancelled')) DEFAULT 'Open',
                priority VARCHAR(50) CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // Trigger to update updated_at automatically
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tickets_updated_at') THEN
                    CREATE TRIGGER update_tickets_updated_at
                    BEFORE UPDATE ON tickets
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
                END IF;
            END
            $$;
        `);

        console.log("✅ Tickets table ready");
    } catch (err) {
        console.error("❌ Failed to ensure tickets table", err);
        throw err;
    }
};

module.exports = { ensureTicketsTable };
