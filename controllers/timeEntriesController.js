const pool = require("../db");

// Create a time entry
exports.createTimeEntry = async (req, res) => {
  try {
    const {
      taskId,
      project,
      project_code,
      country,
      remarks,
      date,
      hours = 0,
      minutes = 0,
      client
    } = req.body;
    
    // Get user info from authenticated request (set by auth middleware)
    const userEmail = req.user?.email;
    
    if (!taskId || !date) {
      return res.status(400).json({ error: "taskId and date are required" });
    }

    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Fetch user details from database
    const userResult = await pool.query(
      'SELECT name, email, dept FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    const result = await pool.query(
      `
      INSERT INTO time_entries (task_id, user_name,user_dept,user_email, project_name,project_code, location, remarks,client, entry_date, hours, minutes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        taskId,
        user.name,
        user.dept,
        user.email,
        project || null,
        project_code || null,
        country || null,
        remarks || null,
        client || "",
        date,
        hours,
        minutes
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to insert time entry" });
  }
};

// Get time entries for a given date or week range
exports.getTimeEntries = async (req, res) => {
  try {
    const { date, start, end } = req.query;

    let query = "SELECT * FROM time_entries";
    const params = [];

    if (date) {
      params.push(date);
      query += ` WHERE entry_date = $${params.length}`;
    } else if (start && end) {
      params.push(start, end);
      query += ` WHERE entry_date BETWEEN $1 AND $2`;
    }

    query += " ORDER BY entry_date DESC, created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch time entries" });
  }
};

// Get time entries by user (by name) - now uses authenticated user
exports.getTimeEntriesByUser = async (req, res) => {
  try {
    // Get user email from authenticated request
    const userEmail = req.user?.email;
    const { start, end } = req.query;
    
    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Fetch user details to get name
    const userResult = await pool.query(
      'SELECT name FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userName = userResult.rows[0].name;

    let query = `
      SELECT *
      FROM time_entries
      WHERE user_name = $1
    `;
    const params = [userName];

    if (start && end) {
      params.push(start, end);
      query += ` AND entry_date BETWEEN $2 AND $3`;
    }

    query += ` ORDER BY entry_date DESC, created_at DESC`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user time entries" });
  }
};

// Delete a time entry - only allow deleting own entries
exports.deleteTimeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // First check if the entry exists and belongs to the user
    const checkResult = await pool.query(
      `SELECT * FROM time_entries WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    // Verify the entry belongs to the authenticated user
    const userResult = await pool.query(
      'SELECT name FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userName = userResult.rows[0].name;
    
    if (checkResult.rows[0].user_name !== userName) {
      return res.status(403).json({ error: "You can only delete your own time entries" });
    }

    const result = await pool.query(
      `DELETE FROM time_entries WHERE id = $1 RETURNING *`,
      [id]
    );

    res.json({ message: "Time entry deleted", deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete time entry" });
  }
};

// Update a time entry - only allow updating own entries
exports.updateTimeEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { taskId, hours, minutes, project, country, remarks, entry_date, client } =
      req.body;
    
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // First check if the entry exists and belongs to the user
    const checkResult = await pool.query(
      `SELECT * FROM time_entries WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    // Verify the entry belongs to the authenticated user
    const userResult = await pool.query(
      'SELECT name FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userName = userResult.rows[0].name;
    
    if (checkResult.rows[0].user_name !== userName) {
      return res.status(403).json({ error: "You can only update your own time entries" });
    }

    const result = await pool.query(
      `
        UPDATE time_entries
        SET task_id = $1,
            hours = $2,
            minutes = $3,
            project_name = $4,
            location = $5,
            remarks = $6,
            entry_date = $7,
            client=$8
        WHERE id = $9
        RETURNING *
        `,
      [taskId, hours, minutes, project, country, remarks, entry_date, client, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update time entry" });
  }
};
