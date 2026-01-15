const pool = require("../db");

// Submit timesheet for approval
exports.submitTimesheetForApproval = async (req, res) => {
  try {
    const { weekStartDate, weekEndDate, totalHours } = req.body;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    if (!weekStartDate || !weekEndDate) {
      return res.status(400).json({ error: "Week start and end dates are required" });
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id, name, reporting_manager_id FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Check if user has a reporting manager
    if (!user.reporting_manager_id) {
      return res.status(400).json({ 
        error: "No reporting manager assigned. Please contact your administrator." 
      });
    }

    // Check if timesheet already exists for this week
    const existingResult = await pool.query(
      `SELECT id, status FROM timesheet_approvals 
       WHERE user_id = $1 AND week_start_date = $2 AND week_end_date = $3`,
      [user.id, weekStartDate, weekEndDate]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing submission
      result = await pool.query(
        `UPDATE timesheet_approvals 
         SET total_hours = $1, submitted_at = CURRENT_TIMESTAMP, status = 'pending',
             approved_by = NULL, approved_at = NULL, rejection_reason = NULL
         WHERE id = $2
         RETURNING *`,
        [totalHours, existingResult.rows[0].id]
      );
    } else {
      // Create new submission
      result = await pool.query(
        `INSERT INTO timesheet_approvals 
         (user_id, week_start_date, week_end_date, total_hours, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [user.id, weekStartDate, weekEndDate, totalHours]
      );
    }

    res.status(200).json({
      message: "Timesheet submitted for approval",
      timesheet: result.rows[0]
    });
  } catch (err) {
    console.error("Submit timesheet error:", err);
    res.status(500).json({ error: "Failed to submit timesheet" });
  }
};

// Get timesheets pending approval for manager
exports.getTimesheetsForApproval = async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get manager details
    const managerResult = await pool.query(
      'SELECT id, is_manager FROM users WHERE email = $1',
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    if (!manager.is_manager) {
      return res.status(403).json({ error: "Access denied. Manager privileges required." });
    }

    // Get all timesheets from team members
    const result = await pool.query(
      `SELECT 
        ta.id,
        ta.user_id,
        ta.week_start_date,
        ta.week_end_date,
        ta.status,
        ta.total_hours,
        ta.submitted_at,
        ta.approved_at,
        ta.rejection_reason,
        u.name as user_name,
        u.email as user_email,
        u.dept as user_dept
       FROM timesheet_approvals ta
       JOIN users u ON ta.user_id = u.id
       WHERE u.reporting_manager_id = $1
       ORDER BY ta.submitted_at DESC`,
      [manager.id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get timesheets error:", err);
    res.status(500).json({ error: "Failed to fetch timesheets" });
  }
};

// Approve timesheet
exports.approveTimesheet = async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get manager details
    const managerResult = await pool.query(
      'SELECT id, is_manager FROM users WHERE email = $1',
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    if (!manager.is_manager) {
      return res.status(403).json({ error: "Access denied. Manager privileges required." });
    }

    // Verify the timesheet belongs to a team member
    const timesheetResult = await pool.query(
      `SELECT ta.*, u.reporting_manager_id 
       FROM timesheet_approvals ta
       JOIN users u ON ta.user_id = u.id
       WHERE ta.id = $1`,
      [id]
    );

    if (timesheetResult.rows.length === 0) {
      return res.status(404).json({ error: "Timesheet not found" });
    }

    const timesheet = timesheetResult.rows[0];

    if (timesheet.reporting_manager_id !== manager.id) {
      return res.status(403).json({ 
        error: "You can only approve timesheets for your direct reports" 
      });
    }

    // Approve the timesheet
    const result = await pool.query(
      `UPDATE timesheet_approvals 
       SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [manager.id, id]
    );

    res.status(200).json({
      message: "Timesheet approved successfully",
      timesheet: result.rows[0]
    });
  } catch (err) {
    console.error("Approve timesheet error:", err);
    res.status(500).json({ error: "Failed to approve timesheet" });
  }
};

// Reject timesheet
exports.rejectTimesheet = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    // Get manager details
    const managerResult = await pool.query(
      'SELECT id, is_manager FROM users WHERE email = $1',
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    if (!manager.is_manager) {
      return res.status(403).json({ error: "Access denied. Manager privileges required." });
    }

    // Verify the timesheet belongs to a team member
    const timesheetResult = await pool.query(
      `SELECT ta.*, u.reporting_manager_id 
       FROM timesheet_approvals ta
       JOIN users u ON ta.user_id = u.id
       WHERE ta.id = $1`,
      [id]
    );

    if (timesheetResult.rows.length === 0) {
      return res.status(404).json({ error: "Timesheet not found" });
    }

    const timesheet = timesheetResult.rows[0];

    if (timesheet.reporting_manager_id !== manager.id) {
      return res.status(403).json({ 
        error: "You can only reject timesheets for your direct reports" 
      });
    }

    // Reject the timesheet
    const result = await pool.query(
      `UPDATE timesheet_approvals 
       SET status = 'rejected', approved_by = $1, approved_at = CURRENT_TIMESTAMP, rejection_reason = $2
       WHERE id = $3
       RETURNING *`,
      [manager.id, reason, id]
    );

    res.status(200).json({
      message: "Timesheet rejected",
      timesheet: result.rows[0]
    });
  } catch (err) {
    console.error("Reject timesheet error:", err);
    res.status(500).json({ error: "Failed to reject timesheet" });
  }
};

// Get my timesheet submission status
exports.getMyTimesheetStatus = async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Get all timesheet submissions
    const result = await pool.query(
      `SELECT 
        ta.*,
        m.name as approved_by_name
       FROM timesheet_approvals ta
       LEFT JOIN users m ON ta.approved_by = m.id
       WHERE ta.user_id = $1
       ORDER BY ta.week_start_date DESC`,
      [user.id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get my timesheet status error:", err);
    res.status(500).json({ error: "Failed to fetch timesheet status" });
  }
};

// Get team timesheet history (for managers)
exports.getTeamTimesheetHistory = async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const { status } = req.query;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get manager details
    const managerResult = await pool.query(
      'SELECT id, is_manager FROM users WHERE email = $1',
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    if (!manager.is_manager) {
      return res.status(403).json({ error: "Access denied. Manager privileges required." });
    }

    let query = `
      SELECT 
        ta.id,
        ta.user_id,
        ta.week_start_date,
        ta.week_end_date,
        ta.status,
        ta.total_hours,
        ta.submitted_at,
        ta.approved_at,
        ta.rejection_reason,
        u.name as user_name,
        u.email as user_email,
        u.dept as user_dept
       FROM timesheet_approvals ta
       JOIN users u ON ta.user_id = u.id
       WHERE u.reporting_manager_id = $1
    `;

    const params = [manager.id];

    if (status) {
      query += ` AND ta.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY ta.submitted_at DESC`;

    const result = await pool.query(query, params);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Get team history error:", err);
    res.status(500).json({ error: "Failed to fetch team timesheet history" });
  }
};

// Get detailed time entries for a timesheet
exports.getTimesheetDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get manager details
    const managerResult = await pool.query(
      'SELECT id, is_manager FROM users WHERE email = $1',
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    // Get timesheet info to verify access
    const timesheetResult = await pool.query(
      `SELECT ta.*, u.email as employee_email, u.reporting_manager_id
       FROM timesheet_approvals ta
       JOIN users u ON ta.user_id = u.id
       WHERE ta.id = $1`,
      [id]
    );

    if (timesheetResult.rows.length === 0) {
      return res.status(404).json({ error: "Timesheet not found" });
    }

    const timesheet = timesheetResult.rows[0];

    // Check if manager is authorized (must be the reporting manager or the user themselves)
    const isOwner = timesheet.employee_email === userEmail;
    const isManager = timesheet.reporting_manager_id === manager.id;

    if (!isOwner && !isManager) {
      return res.status(403).json({ 
        error: "Access denied. You can only view details for your own timesheets or your direct reports." 
      });
    }

    // Fetch detailed time entries
    const entriesResult = await pool.query(
      `SELECT * FROM time_entries 
       WHERE user_email = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date ASC, created_at ASC`,
      [timesheet.employee_email, timesheet.week_start_date, timesheet.week_end_date]
    );

    res.status(200).json({
      timesheet,
      entries: entriesResult.rows
    });
  } catch (err) {
    console.error("Get timesheet details error:", err);
    res.status(500).json({ error: "Failed to fetch timesheet details" });
  }
};

module.exports = exports;
