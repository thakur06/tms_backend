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

    if (existingResult.rows.length > 0) {
      const currentStatus = existingResult.rows[0].status;
      
      // If timesheet is already pending or approved, block resubmission
      if (currentStatus === 'pending' || currentStatus === 'approved') {
        return res.status(400).json({ 
          error: `This timesheet is already ${currentStatus}. You cannot resubmit it unless it is rejected.` 
        });
      }

      // Update existing submission (only if it was rejected or somehow else back to editting)
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

// Get timesheets pending approval for manager or admin
exports.getTimesheetsForApproval = async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get requester details
    const requesterResult = await pool.query(
      `SELECT id, role, 
       (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count 
       FROM users u WHERE email = $1`,
      [userEmail]
    );

    if (requesterResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const requester = requesterResult.rows[0];
    const isAdmin = requester.role === 'admin';
    const isManager = parseInt(requester.reports_count) > 0;

    if (!isAdmin && !isManager) {
      return res.status(403).json({ error: "Access denied. Manager or Admin privileges required." });
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
        u.dept as user_dept,
        u.reporting_manager_id,
        m.name as manager_name
      FROM timesheet_approvals ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
    `;

    const params = [];

    // If Admin, see ALL (or filter by status if needed, but 'pending' is default context often)
    // If Manager (and not Admin), see only direct reports
    if (!isAdmin) {
      query += ` WHERE u.reporting_manager_id = $1`;
      params.push(requester.id);
    }

    query += ` ORDER BY ta.submitted_at DESC`;

    const result = await pool.query(query, params);

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

    const requesterResult = await pool.query(
      `SELECT id, role FROM users WHERE email = $1`,
      [userEmail]
    );

    if (requesterResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const requester = requesterResult.rows[0];
    const isAdmin = requester.role === 'admin';

    // Verify the timesheet exists and get ownership info
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

    // Check permissions: Must be Admin OR Direct Manager
    if (!isAdmin && timesheet.reporting_manager_id !== requester.id) {
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
      [requester.id, id]
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

    const requesterResult = await pool.query(
      `SELECT id, role FROM users WHERE email = $1`,
      [userEmail]
    );

    if (requesterResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const requester = requesterResult.rows[0];
    const isAdmin = requester.role === 'admin';

    // Verify the timesheet exists and get ownership info
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

    // Check permissions: Must be Admin OR Direct Manager
    if (!isAdmin && timesheet.reporting_manager_id !== requester.id) {
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
      [requester.id, reason, id]
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

    // Get manager details including reports count
    const managerResult = await pool.query(
      `SELECT u.id, u.role, 
       (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count 
       FROM users u WHERE u.email = $1`,
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    if (parseInt(manager.reports_count) === 0 && manager.role !== 'admin') {
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

    // Get manager details including reports count
    const managerResult = await pool.query(
      `SELECT u.id, u.role, 
       (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count 
       FROM users u WHERE u.email = $1`,
      [userEmail]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const manager = managerResult.rows[0];

    // Get timesheet info with user name
    const timesheetResult = await pool.query(
      `SELECT ta.*, u.name as user_name, u.email as employee_email, u.reporting_manager_id
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
    const isAdmin = manager.role === 'admin';

    if (!isOwner && !isManager && !isAdmin) {
      return res.status(403).json({ 
        error: "Access denied. You can only view details for your own timesheets or your direct reports." 
      });
    }

    // Fetch detailed time entries with task name (handles both numeric IDs and raw names in te.task_id)
    const entriesResult = await pool.query(
      `SELECT te.*, tk.task_name 
       FROM time_entries te
       LEFT JOIN tasks tk ON 
         (CASE WHEN te.task_id ~ '^[0-9]+$' THEN te.task_id::integer = tk.task_id ELSE FALSE END)
         OR (te.task_id = tk.task_name)
       WHERE te.user_email = $1 AND te.entry_date >= $2 AND te.entry_date <= $3
       ORDER BY te.entry_date ASC, te.created_at ASC`,
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

// Get timesheet compliance report (Daily summaries + Status)
exports.getTimesheetComplianceReport = async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const { startDate, endDate, scope } = req.query; // Expects YYYY-MM-DD
    
    if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
    }

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get requester details
    const requesterResult = await pool.query(
      `SELECT u.id, u.role, 
       (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count 
       FROM users u WHERE email = $1`,
      [userEmail]
    );

    if (requesterResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const requester = requesterResult.rows[0];
    const isAdmin = requester.role === 'admin';
    const isManager = parseInt(requester.reports_count) > 0;

    if (!isAdmin && !isManager) {
      return res.status(403).json({ error: "Access denied. Manager or Admin privileges required." });
    }

    // Base query to get relevant users
    let usersQuery = `SELECT id, name, email, dept, reporting_manager_id FROM users WHERE 1=1`; 
    const queryParams = [];
    
    // Filter logic:
    // 1. If not admin, strictly show only direct reports
    // 2. If admin and scope=team, show only direct reports
    // 3. Otherwise (admin and no scope=team), show everyone
    if (!isAdmin || scope === 'team') {
        usersQuery += ` AND reporting_manager_id = $1`;
        queryParams.push(requester.id);
    } 
    // If Admin, sees all (no filter added)

    const usersResult = await pool.query(usersQuery, queryParams);
    const users = usersResult.rows;

    if (users.length === 0) {
        return res.status(200).json([]);
    }

    // Now for each user, fetch their timesheet status AND daily totals for the range
    // We can do this with a complex join or map over users. 
    // For performance with large user base, a single efficient query is better, but iteration is safer logic-wise for now.
    // Let's try a single query approach using the user IDs.

    const userIds = users.map(u => u.id);
    
    // 1. Get Timesheet Statuses for this week
    const statusQuery = `
        SELECT user_id, status, total_hours, submitted_at, id as timesheet_id, rejection_reason
        FROM timesheet_approvals 
        WHERE user_id = ANY($1) 
        AND week_start_date = $2 
        AND week_end_date = $3
    `;
    const statusResult = await pool.query(statusQuery, [userIds, startDate, endDate]);
    const statusMap = {};
    statusResult.rows.forEach(r => statusMap[r.user_id] = r);

    // 2. Get Daily Totals from time_entries
    const userEmails = users.map(u => u.email);
    const entriesQuery = `
        SELECT user_email, entry_date, SUM(hours) as hours, SUM(minutes) as minutes
        FROM time_entries
        WHERE user_email = ANY($1) AND entry_date >= $2 AND entry_date <= $3
        GROUP BY user_email, entry_date
    `;
    const entriesResult = await pool.query(entriesQuery, [userEmails, startDate, endDate]);
    
    // Aggregation
    const entriesMap = {};
    entriesResult.rows.forEach(r => {
        // Map back to user ID for consistency with status map
        // We need to find the user ID corresponding to this email
        const user = users.find(u => u.email === r.user_email);
        if (user) {
            // Fix: Use local date components or string manipulation to avoid timezone shift
            const d = new Date(r.entry_date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const k = `${user.id}-${dateStr}`;
            if (!entriesMap[k]) entriesMap[k] = 0;
            entriesMap[k] += (parseFloat(r.hours) || 0) + ((parseFloat(r.minutes) || 0) / 60);
        }
    });

    // 3. Assemble Report
    const report = users.map(u => {
        const s = statusMap[u.id];
        const dailyHours = {};
        let total = 0;
        
        // Loop through requested date range (7 days)
        const d = new Date(startDate);
        for(let i=0; i<7; i++) {
            // Need consistent string format for lookup
            // startDate is YYYY-MM-DD from client
            // d is created from it (UTC midnight usually if just date string)
            // But we want to iterate date by date
            
            // To be safe, construct date string manually from d (which iterates)
            // If d is created as UTC, getUTCDate works. If local, getDate works.
            // Let's assume startDate is 'YYYY-MM-DD' key. 
            // We can just parse startDate parts and increment.
            
            // Actually simpler: 
            const iterDate = new Date(startDate);
            iterDate.setDate(iterDate.getDate() + i);
            const iy = iterDate.getFullYear();
            const im = String(iterDate.getMonth() + 1).padStart(2, '0');
            const id = String(iterDate.getDate()).padStart(2, '0');
            const dateStr = `${iy}-${im}-${id}`;

            const val = entriesMap[`${u.id}-${dateStr}`] || 0;
            dailyHours[dateStr] = val;
            total += val;
        }

        return {
            user: {
                id: u.id,
                name: u.name,
                email: u.email,
                dept: u.dept
            },
            status: s ? s.status : 'not_submitted',
            submittedAt: s ? s.submitted_at : null,
            rejectionReason: s ? s.rejection_reason : null,
            totalHours: total,
            daily: dailyHours, // Frontend expects 'daily'
            timesheetId: s ? s.timesheet_id : null
        };
    });

    res.json(report);

  } catch (err) {
    console.error("Compliance report error:", err);
    res.status(500).json({ error: "Failed to generate compliance report" });
  }
};

module.exports = exports;
