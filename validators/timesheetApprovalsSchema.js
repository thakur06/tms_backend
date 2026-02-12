const pool = require("../db");

const ensureTimesheetApprovalsTable = async () => {
  try {
    // 1️⃣ Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timesheet_approvals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        week_end_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_hours DECIMAL(5,2),
        UNIQUE(user_id, week_start_date, week_end_date)
      );
    `);

    // 2️⃣ Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_user 
      ON timesheet_approvals(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_status 
      ON timesheet_approvals(status);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_approver 
      ON timesheet_approvals(approved_by);
    `);

    console.log("✅ Timesheet Approvals table & indexes ready");
  } catch (err) {
    console.error("❌ Failed to ensure timesheet_approvals table", err);
    throw err;
  }
};

module.exports = { ensureTimesheetApprovalsTable };
