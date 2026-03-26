const pool = require("../db");

const ensureSurfaceAreaCalculationsTable = async () => {
  try {
    await pool.query(`
      DROP TABLE IF EXISTS surface_area_calculations;
      CREATE TABLE surface_area_calculations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        data JSONB NOT NULL,
        total_area NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INT
      );
    `);

    console.log("✅ Surface Area Calculations table ready");
  } catch (err) {
    console.error("❌ Failed to ensure surface_area_calculations table", err);
    throw err;
  }
};

module.exports = { ensureSurfaceAreaCalculationsTable };
