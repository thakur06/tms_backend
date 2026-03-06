const pool = require("../db");

const ensurePipeSpecificationsTable = async () => {
  try {
    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pipe_specifications (
        id SERIAL PRIMARY KEY,
        items TEXT NOT NULL,
        size_label TEXT NOT NULL,
        size_decimal NUMERIC(10, 3) NOT NULL,
        pipe_flange_od NUMERIC(10, 3) NOT NULL,
        class_label TEXT NOT NULL DEFAULT 'NA',
        value_length NUMERIC(10, 3) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pipe_specs_items ON pipe_specifications(items);
      CREATE INDEX IF NOT EXISTS idx_pipe_specs_size_label ON pipe_specifications(size_label);
    `);

    console.log("✅ Pipe Specifications table & indexes ready");
  } catch (err) {
    console.error("❌ Failed to ensure pipe_specifications table", err);
    throw err;
  }
};

module.exports = { ensurePipeSpecificationsTable };
