const pool = require("../db");
const { syncTimeEntryToAssignment } = require("./userProjectController");

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

    // Bidirectional Sync: Update project assignments
    await syncTimeEntryToAssignment(pool, user.email, date, hours, taskId);

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

    const deletedEntry = result.rows[0];
    // Bidirectional Sync: Remove assignment
    await syncTimeEntryToAssignment(pool, userEmail, deletedEntry.entry_date, 0, deletedEntry.task_id);

    res.json({ message: "Time entry deleted", deleted: deletedEntry });
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

    const updatedEntry = result.rows[0];
    
    // Bidirectional Sync: Update assignment
    // If the date or task changed, we should ideally clear the old assignment too, 
    // but syncTimeEntryToAssignment handles the CURRENT state. 
    // To be safe, if date changed, we'd need to sync the OLD date with 0 hours.
    if (checkResult.rows[0].entry_date !== entry_date || checkResult.rows[0].task_id !== taskId) {
        await syncTimeEntryToAssignment(pool, userEmail, checkResult.rows[0].entry_date, 0, checkResult.rows[0].task_id);
    }
    await syncTimeEntryToAssignment(pool, userEmail, entry_date, hours, taskId);

    res.json(updatedEntry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update time entry" });
  }
};
// Bulk create/update/delete time entries
exports.bulkTimeEntry = async (req, res) => {
  const client = await pool.connect();
  try {
    const { operations } = req.body;
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ error: "User authentication required" });
    }

    // Get user details
    const userResult = await client.query(
      'SELECT name, email, dept FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userResult.rows[0];

    await client.query('BEGIN');

    const results = [];

    for (const op of operations) {
      if (op.type === 'create') {
        const { taskId, project, project_code, country, remarks, date, hours, minutes, client: clientName } = op.data;
        const res = await client.query(
          `INSERT INTO time_entries (task_id, user_name, user_dept, user_email, project_name, project_code, location, remarks, client, entry_date, hours, minutes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [taskId, user.name, user.dept, user.email, project, project_code, country || 'US', remarks, clientName || '', date, hours || 0, minutes || 0]
        );
        const newId = res.rows[0].id;

        // Bidirectional Sync
        await syncTimeEntryToAssignment(client, user.email, date, hours || 0, taskId);

        results.push({ type: 'create', id: newId });
      } else if (op.type === 'update') {
        const { id, taskId, project, project_code, country, remarks, date, hours, minutes, client: clientName } = op.data;
        // Verify ownership (simplified for bulk)
        const check = await client.query('SELECT user_email FROM time_entries WHERE id = $1', [id]);
        if (check.rows.length > 0 && check.rows[0].user_email === userEmail) {
           await client.query(
            `UPDATE time_entries SET task_id=$1, project_name=$2, project_code=$3, location=$4, remarks=$5, client=$6, entry_date=$7, hours=$8, minutes=$9 WHERE id=$10`,
            [taskId, project, project_code, country || 'US', remarks, clientName || '', date, hours || 0, minutes || 0, id]
          );

          // Bidirectional Sync
          if (check.rows[0].entry_date !== date || check.rows[0].task_id !== taskId) {
              await syncTimeEntryToAssignment(client, userEmail, check.rows[0].entry_date, 0, check.rows[0].task_id);
          }
          await syncTimeEntryToAssignment(client, userEmail, date, hours || 0, taskId);

          results.push({ type: 'update', id });
        }
      } else if (op.type === 'delete') {
        const { id } = op.data;
        const check = await client.query('SELECT user_email, entry_date, task_id FROM time_entries WHERE id = $1', [id]);
        if (check.rows.length > 0 && check.rows[0].user_email === userEmail) {
          const deletedEntry = check.rows[0];
          await client.query('DELETE FROM time_entries WHERE id = $1', [id]);

          // Bidirectional Sync
          await syncTimeEntryToAssignment(client, userEmail, deletedEntry.entry_date, 0, deletedEntry.task_id);

          results.push({ type: 'delete', id });
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message: "Bulk operations completed", results });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Bulk op failed", err);
    res.status(500).json({ error: "Failed to process bulk entries" });
  } finally {
    client.release();
  }
};
