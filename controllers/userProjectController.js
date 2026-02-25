const pool = require("../db");

// Helper to count workdays between two dates (inclusive)
const countWorkdays = (startStr, endStr) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  let count = 0;
  let cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

// Helper to sync PTO hours for regular projects
const syncPTOHours = async (client, userId, startDate, endDate) => {
  try {
    // 1. Find all regular assignments (non-PTO) that overlap with the changed range
    const assignmentsRes = await client.query(
      `SELECT up.id, up.user_id, up.start_date, up.end_date, up.base_hours
       FROM user_projects up
       JOIN projects p ON up.project_id = p.id
       WHERE up.user_id = $1
       AND (p.category != 'PTO' AND p.name != 'Leave')
       AND up.start_date <= $3::DATE AND up.end_date >= $2::DATE`,
      [userId, startDate, endDate]
    );

    for (const ass of assignmentsRes.rows) {
      // 2. Sum ALL PTO hours for this user within THIS assignment's range
      const ptoCheck = await client.query(
        `SELECT COALESCE(SUM(allocation_hours), 0) as pto_hours
         FROM user_projects up
         JOIN projects p ON up.project_id = p.id
         WHERE up.user_id = $1 
         AND (p.category = 'PTO' OR p.name = 'Leave')
         AND up.start_date <= $3::DATE AND up.end_date >= $2::DATE`,
        [ass.user_id, ass.start_date, ass.end_date]
      );

      const ptoHours = parseFloat(ptoCheck.rows[0].pto_hours);
      const newAllocation = parseFloat(ass.base_hours) + ptoHours;
      const remarks = ptoHours > 0 ? `Includes ${ptoHours}h of PTO during the period` : null;

      await client.query(
        "UPDATE user_projects SET allocation_hours = $1, remarks = $2, updated_at = NOW() WHERE id = $3",
        [newAllocation, remarks, ass.id]
      );
    }
  } catch (err) {
    console.error("Failed to sync PTO hours:", err);
    throw err;
  }
};

// Get all user-project assignments with user and project details
exports.getAllAssignments = async (req, res) => {
  try {
    const { date, month: qMonth, year: qYear, startDate: rStart, endDate: rEnd } = req.query;
    let startDate, endDate;

    if (rStart && rEnd) {
      startDate = rStart;
      endDate = rEnd;
    } else if (qMonth && qYear) {
      startDate = `${qYear}-${String(qMonth).padStart(2, '0')}-01`;
      endDate = new Date(qYear, qMonth, 0).toISOString().split('T')[0];
    } else {
      const targetDate = date || new Date().toISOString().split('T')[0];
      startDate = targetDate;
      endDate = targetDate;
    }

    const query = `
      SELECT 
        up.id,
        up.user_id,
        up.project_id,
        up.allocation_hours,
        up.base_hours,
        up.start_date,
        up.end_date,
        up.remarks,
        up.created_at,
        up.updated_at,
        u.name as user_name,
        u.email as user_email,
        u.dept as user_dept,
        p.name as project_name,
        p.code as project_code,
        p.client as project_client,
        p.category as project_category
      FROM user_projects up
      INNER JOIN users u ON up.user_id = u.id
      INNER JOIN projects p ON up.project_id = p.id
      WHERE up.start_date <= $2::DATE AND up.end_date >= $1::DATE
      ORDER BY u.name, p.name
    `;
    
    const result = await pool.query(query, [startDate, endDate]);
    
    // Group by user for easier frontend consumption
    const groupedByUser = result.rows.reduce((acc, row) => {
      // Pro-rate hours based on workdays in the selected range
      const totalWorkdays = countWorkdays(row.start_date, row.end_date);
      
      const assStart = new Date(row.start_date);
      const assEnd = new Date(row.end_date);
      const qStart = new Date(startDate);
      const qEnd = new Date(endDate);
      
      const oStart = assStart > qStart ? row.start_date : startDate;
      const oEnd = assEnd < qEnd ? row.end_date : endDate;
      
      const overlapWorkdays = countWorkdays(oStart, oEnd);
      
      if (totalWorkdays > 0) {
        row.allocation_hours = parseFloat(((overlapWorkdays / totalWorkdays) * row.allocation_hours).toFixed(2));
      } else if (assStart >= qStart && assEnd <= qEnd) {
        // If it's a weekend-only assignment and fully fits in query, show it
        // Otherwise it might be confusing if it disappears entirely
        row.allocation_hours = row.allocation_hours;
      } else {
        row.allocation_hours = 0;
      }

      const userId = row.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          user_name: row.user_name,
          user_email: row.user_email,
          user_dept: row.user_dept,
          total_allocation: 0,
          projects: []
        };
      }
      
      acc[userId].projects.push({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        project_code: row.project_code,
        project_client: row.project_client,
        project_category: row.project_category,
        allocation_hours: row.allocation_hours,
        base_hours: row.base_hours,
        remarks: row.remarks,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
      
      acc[userId].total_allocation = parseFloat((acc[userId].total_allocation + row.allocation_hours).toFixed(2));
      
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: Object.values(groupedByUser)
    });
  } catch (err) {
    console.error("Failed to fetch assignments:", err);
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
};

// Get assignments for a specific user
exports.getUserAssignments = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        up.id,
        up.user_id,
        up.project_id,
        up.allocation_hours,
        up.base_hours,
        up.start_date,
        up.end_date,
        up.remarks,
        up.created_at,
        up.updated_at,
        p.name as project_name,
        p.code as project_code,
        p.client as project_client,
        p.location as project_location,
        p.category as project_category
      FROM user_projects up
      INNER JOIN projects p ON up.project_id = p.id
      WHERE up.user_id = $1
      ORDER BY p.name
    `;
    
    const result = await pool.query(query, [userId]);
    
    const totalAllocation = result.rows.reduce((sum, row) => sum + row.allocation_hours, 0);
    
    res.json({
      success: true,
      user_id: parseInt(userId),
      total_allocation: totalAllocation,
      assignments: result.rows
    });
  } catch (err) {
    console.error("Failed to fetch user assignments:", err);
    res.status(500).json({ error: "Failed to fetch user assignments" });
  }
};

// Create new assignment or merge with existing
exports.createAssignment = async (req, res) => {
  try {
    const { user_id, project_id, allocation_hours, start_date, end_date } = req.body;
    
    // Validation
    if (!user_id || !project_id || allocation_hours === undefined || !start_date || !end_date) {
      return res.status(400).json({ error: "user_id, project_id, allocation_hours, start_date, and end_date are required" });
    }
    
    if (allocation_hours < 0 || allocation_hours > 744) {
      return res.status(400).json({ error: "allocation_hours must be between 0 and 744" });
    }

    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: "Start date must be before or equal to end date" });
    }

    // 0. Check if this is a PTO project assignment (Leave)
    const projectCheck = await pool.query("SELECT category, name FROM projects WHERE id = $1", [project_id]);
    const isPto = projectCheck.rows.length > 0 && (projectCheck.rows[0].category === 'PTO' || projectCheck.rows[0].name === 'Leave');

    let finalAllocation = parseFloat(allocation_hours);
    let finalBaseHours = parseFloat(allocation_hours);
    let finalRemarks = null;

    if (!isPto) {
      // Find PTO hours for this user in the range
      const ptoCheck = await pool.query(
        `SELECT COALESCE(SUM(allocation_hours), 0) as pto_hours
         FROM user_projects up
         JOIN projects p ON up.project_id = p.id
         WHERE up.user_id = $1 
         AND (p.category = 'PTO' OR p.name = 'Leave')
         AND up.start_date <= $3::DATE AND up.end_date >= $2::DATE`,
        [user_id, start_date, end_date]
      );
      
      const ptoHoursNum = parseFloat(ptoCheck.rows[0].pto_hours);
      if (ptoHoursNum > 0) {
        finalAllocation += ptoHoursNum;
        finalRemarks = `Includes ${ptoHoursNum}h of PTO during the period`;
        res.pto_hours_added = ptoHoursNum; // Store in local var for response
      }
    }

    // 1. New Assignment Logic (No longer merging same projects automatically)
    
    // Check 160h Cap for NEW insert (now 744h)
    const overlappingCheck = await pool.query(
      `SELECT COALESCE(MAX(current_day_allocation), 0) as max_allocation
       FROM (
         SELECT generate_series($1::date, $2::date, '1 day'::interval) as day
       ) d
       CROSS JOIN LATERAL (
         SELECT SUM(allocation_hours) as current_day_allocation
         FROM user_projects
         WHERE user_id = $3
         AND d.day BETWEEN start_date AND end_date
       ) up`,
      [start_date, end_date, user_id]
    );

    const currentMax = overlappingCheck.rows.length > 0 ? parseFloat(overlappingCheck.rows[0].max_allocation) : 0;
    if (currentMax + parseFloat(allocation_hours) > 744) {
      return res.status(400).json({ 
        error: `Total allocation would exceed 744h on some dates. Max existing: ${currentMax}h. Requested: ${allocation_hours}h` 
      });
    }
    
    // Insert new assignment
    const insertQuery = `
      INSERT INTO user_projects (user_id, project_id, allocation_hours, base_hours, start_date, end_date, remarks)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await pool.query(insertQuery, [user_id, project_id, finalAllocation, finalBaseHours, start_date, end_date, finalRemarks]);
    
    // If it's a PTO, sync overlapping projects
    if (isPto) {
      await syncPTOHours(pool, user_id, start_date, end_date);
    }
    
    // Sync to Time Entries if PTO
    await syncAssignmentToTimeEntries(pool, result.rows[0].id);

    return res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      data: result.rows[0],
      pto_hours_added: res.pto_hours_added || 0
    });

  } catch (err) {
    console.error("Failed to create/merge assignment:", err);
    res.status(500).json({ error: "Failed to process assignment" });
  }
};

// Update assignment
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { allocation_hours, start_date, end_date } = req.body;
    
    // Get current assignment
    const currentAssignmentQuery = await pool.query(
      "SELECT user_id, start_date, end_date, allocation_hours FROM user_projects WHERE id = $1",
      [id]
    );
    
    if (currentAssignmentQuery.rows.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    
    const assignment = currentAssignmentQuery.rows[0];
    const targetUserId = assignment.user_id;
    const finalStartDate = start_date || assignment.start_date;
    const finalEndDate = end_date || assignment.end_date;

    if (new Date(finalStartDate) > new Date(finalEndDate)) {
      return res.status(400).json({ error: "Start date must be before or equal to end date" });
    }

    // 0. Check if this is a PTO project assignment (Leave)
    const projectCheck = await pool.query(
      "SELECT category, name FROM projects WHERE id = (SELECT project_id FROM user_projects WHERE id = $1)",
      [id]
    );
    const isPto = projectCheck.rows.length > 0 && (projectCheck.rows[0].category === 'PTO' || projectCheck.rows[0].name === 'Leave');

    let finalBaseHours = allocation_hours !== undefined ? parseFloat(allocation_hours) : parseFloat(assignment.base_hours || assignment.allocation_hours);
    
    if (finalBaseHours < 0 || finalBaseHours > 744) {
      return res.status(400).json({ error: "allocation_hours must be between 0 and 744" });
    }

    let finalAllocation = finalBaseHours;
    let finalRemarks = null;

    if (!isPto) {
      // Find PTO hours for this user in the range
      const ptoCheck = await pool.query(
        `SELECT COALESCE(SUM(allocation_hours), 0) as pto_hours
         FROM user_projects up
         JOIN projects p ON up.project_id = p.id
         WHERE up.user_id = $1 
         AND (p.category = 'PTO' OR p.name = 'Leave')
         AND up.start_date <= $3::DATE AND up.end_date >= $2::DATE
         AND up.id != $4`,
        [targetUserId, finalStartDate, finalEndDate, id]
      );
      
      const ptoHoursNum = parseFloat(ptoCheck.rows[0].pto_hours);
      if (ptoHoursNum > 0) {
        finalAllocation += ptoHoursNum;
        finalRemarks = `Includes ${ptoHoursNum}h of PTO during the period`;
        res.pto_hours_added = ptoHoursNum; // Store in local var for response
      }
    }
    
    // Check total allocation excluding current assignment
    const overlappingCheck = await pool.query(
      `SELECT COALESCE(MAX(current_day_allocation), 0) as max_allocation
       FROM (
         SELECT generate_series($1::date, $2::date, '1 day'::interval) as day
       ) d
       CROSS JOIN LATERAL (
         SELECT SUM(allocation_hours) as current_day_allocation
         FROM user_projects
         WHERE user_id = $3
         AND id != $4
         AND d.day BETWEEN start_date AND end_date
       ) up`,
      [finalStartDate, finalEndDate, targetUserId, id]
    );

    const currentMax = parseFloat(overlappingCheck.rows[0].max_allocation);
    if (currentMax + finalAllocation > 744) {
      return res.status(400).json({ 
        error: `Total allocation would exceed 744h on some dates. Maximum other: ${currentMax}h. Available: ${744 - currentMax}h` 
      });
    }
    
    // Update assignment
    const updateQuery = `
      UPDATE user_projects 
      SET allocation_hours = $1, base_hours = $2, start_date = $3, end_date = $4, remarks = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, [finalAllocation, finalBaseHours, finalStartDate, finalEndDate, finalRemarks, id]);
    
    // If it's a PTO or dates changed, sync overlapping projects
    await syncPTOHours(pool, targetUserId, finalStartDate, finalEndDate);
    // Also sync the old range if dates changed
    if (assignment.start_date !== finalStartDate || assignment.end_date !== finalEndDate) {
      await syncPTOHours(pool, targetUserId, assignment.start_date, assignment.end_date);
    }
    
    // Sync to Time Entries if PTO
    await syncAssignmentToTimeEntries(pool, id);

    res.json({
      success: true,
      message: "Assignment updated successfully",
      data: result.rows[0],
      pto_hours_added: res.pto_hours_added || 0
    });
  } catch (err) {
    console.error("Failed to update assignment:", err);
    res.status(500).json({ error: "Failed to update assignment" });
  }
};

// Delete assignment
exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      "DELETE FROM user_projects WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length > 0) {
        const deletedAss = result.rows[0];
        // Clear sync'd time entries if it was a PTO
        await syncAssignmentToTimeEntries(pool, id, deletedAss); 
        // Sync overlapping projects if this was a PTO
        const ptoCheck = await pool.query("SELECT category, name FROM projects WHERE id = $1", [deletedAss.project_id]);
        if (ptoCheck.rows.length > 0 && (ptoCheck.rows[0].category === 'PTO' || ptoCheck.rows[0].name === 'Leave')) {
            await syncPTOHours(pool, deletedAss.user_id, deletedAss.start_date, deletedAss.end_date);
        }
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    
    res.json({
      success: true,
      message: "Assignment deleted successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Failed to delete assignment:", err);
    res.status(500).json({ error: "Failed to delete assignment" });
  }
};
// Bulk save PTO assignments and auto-sync to time_entries
exports.savePtoAssignments = async (req, res) => {
    const client = await pool.connect();
    try {
        const { assignments, month, year } = req.body; // assignments: [{ user_id, day, hours }]
        
        if (!assignments || !Array.isArray(assignments) || !month || !year) {
            return res.status(400).json({ error: "assignments array, month, and year are required" });
        }

        await client.query('BEGIN');

        // 1. Get the "Leave" project details and "Leave/Holiday" Task ID
        const projectRes = await client.query("SELECT id, name, code FROM projects WHERE category = 'PTO' OR name = 'Leave' LIMIT 1");
        const taskRes = await client.query("SELECT task_id FROM tasks WHERE task_name = 'Leave/Holiday' LIMIT 1");

        if (projectRes.rows.length === 0 || taskRes.rows.length === 0) {
            throw new Error("Pto setup incomplete: Leave project or Leave/Holiday task missing.");
        }

        const leaveProjectId = projectRes.rows[0].id;
        const leaveProjectName = projectRes.rows[0].name;
        const leaveProjectCode = projectRes.rows[0].code;
        const leaveTaskId = taskRes.rows[0].task_id;

        // 2. Identify unique users in this request
        const userIdSet = new Set(assignments.map(a => a.user_id));
        const userIds = Array.from(userIdSet);

        // 3. Define date range for the month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        // 4. Delete existing "Leave" assignments AND time entries for these users in this month
        // This ensures the spreadsheet state is precisely mirrored in the DB
        await client.query(
            `DELETE FROM user_projects 
             WHERE project_id = $1 AND user_id = ANY($2) 
             AND start_date >= $3 AND end_date <= $4`,
            [leaveProjectId, userIds, startDate, endDate]
        );

        await client.query(
            `DELETE FROM time_entries 
             WHERE task_id = $1 AND user_email IN (
                 SELECT email FROM users WHERE id = ANY($2)
             ) AND entry_date BETWEEN $3 AND $4`,
            [leaveTaskId, userIds, startDate, endDate]
        );

        // 5. Insert new assignments and time entries
        for (const ass of assignments) {
            if (ass.hours <= 0) continue;

            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(ass.day).padStart(2, '0')}`;
            
            // Insert assignment
            await client.query(
                `INSERT INTO user_projects (user_id, project_id, allocation_hours, base_hours, start_date, end_date)
                 VALUES ($1, $2, $3, $4, $5, $5)`,
                [ass.user_id, leaveProjectId, ass.hours, ass.hours, dateStr]
            );

            // Fetch user info for time entry
            const userRes = await client.query("SELECT name, email, dept FROM users WHERE id = $1", [ass.user_id]);
            const user = userRes.rows[0];

            // Insert time entry
            await client.query(
                `INSERT INTO time_entries (task_id, user_name, user_dept, user_email, project_name, project_code, entry_date, hours, minutes, remarks)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [leaveTaskId, user.name, user.dept, user.email, leaveProjectName, leaveProjectCode, dateStr, ass.hours, 0, 'Auto-synced from PTO spreadsheet']
            );
        }
        
        // Finalize PTO sync for all affected users
        for (const uid of userIds) {
            await syncPTOHours(client, uid, startDate, endDate);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "PTO assignments and time entries synced successfully." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Bulk PTO save failed:", err);
        res.status(500).json({ error: "Failed to save PTO assignments and sync time entries." });
    } finally {
        client.release();
    }
};

// Sync individual time entry to user_projects assignment (Bidirectional Sync)
exports.syncTimeEntryToAssignment = async (client, userEmail, date, hours, taskId) => {
    try {
        // 1. Get Leave/Holiday Task ID and Leave Project ID
        const taskRes = await client.query("SELECT task_id FROM tasks WHERE task_name = 'Leave/Holiday' LIMIT 1");
        if (taskRes.rows.length === 0) return;

        // Use loose equality or cast to string for comparison to avoid type mismatches
        if (String(taskRes.rows[0].task_id) !== String(taskId)) return;

        const projectRes = await client.query("SELECT id FROM projects WHERE category = 'PTO' OR name = 'Leave' LIMIT 1");
        if (projectRes.rows.length === 0) return;
        const leaveProjectId = projectRes.rows[0].id;

        // 2. Get User ID from email
        const userRes = await client.query("SELECT id FROM users WHERE email = $1", [userEmail]);
        if (userRes.rows.length === 0) return;
        const userId = userRes.rows[0].id;

        // 3. Delete existing assignment for this user/project/date
        await client.query(
            `DELETE FROM user_projects 
             WHERE user_id = $1 AND project_id = $2 AND (start_date = $3 OR end_date = $3)`,
            [userId, leaveProjectId, date]
        );

        // 4. If hours > 0, insert new assignment
        if (parseFloat(hours) > 0) {
            await client.query(
                `INSERT INTO user_projects (user_id, project_id, allocation_hours, base_hours, start_date, end_date)
                 VALUES ($1, $2, $3, $4, $5, $5)`,
                [userId, leaveProjectId, hours, hours, date]
            );
        }

        // Sync regular projects
        await syncPTOHours(client, userId, date, date);
    } catch (err) {
        console.error("Failed to sync time entry to assignment:", err);
        throw err; // Re-throw to trigger rollback in caller
    }
};

// Sync Project Assignment -> Time Entries (Reverse Sync)
const syncAssignmentToTimeEntries = async (client, assignmentId, deletedRow = null) => {
    try {
        let ass;
        if (deletedRow) {
            ass = { ...deletedRow };
            // We need to fetch basic info since row is already deleted
            const projectRes = await client.query("SELECT category, name FROM projects WHERE id = $1", [ass.project_id]);
            if (projectRes.rows.length === 0) return;
            ass.project_category = projectRes.rows[0].category;
            ass.project_name = projectRes.rows[0].name;
            
            const userRes = await client.query("SELECT email FROM users WHERE id = $1", [ass.user_id]);
            if (userRes.rows.length === 0) return;
            ass.user_email = userRes.rows[0].email;
        } else {
            const assRes = await client.query(`
                SELECT up.*, p.category as project_category, p.name as project_name, p.code as project_code,
                       u.name as user_name, u.email as user_email, u.dept as user_dept
                FROM user_projects up
                JOIN projects p ON up.project_id = p.id
                JOIN users u ON up.user_id = u.id
                WHERE up.id = $1
            `, [assignmentId]);
            if (assRes.rows.length === 0) return;
            ass = assRes.rows[0];
        }

        // Only sync if it's a PTO project
        if (ass.project_category !== 'PTO' && ass.project_name !== 'Leave') return;

        // 1. Get Leave/Holiday Task ID
        const taskRes = await client.query("SELECT task_id FROM tasks WHERE task_name = 'Leave/Holiday' LIMIT 1");
        if (taskRes.rows.length === 0) return;
        const leaveTaskId = taskRes.rows[0].task_id;

        // 2. Define standard remarks for auto-sync
        const remarks = 'Auto-synced from Project Assignment';

        // 3. Clear existing time entries for this user/task/date range
        // If updating/creating - we clear the target range. If deleting - we clear the last known range of this assignment.
        await client.query(`
            DELETE FROM time_entries 
            WHERE user_email = $1 AND task_id = $2 AND entry_date BETWEEN $3 AND $4 AND remarks = $5
        `, [ass.user_email, leaveTaskId, ass.start_date, ass.end_date, remarks]);

        // 4. If this wasn't a delete operation, insert new entries
        if (!deletedRow && parseFloat(ass.allocation_hours) > 0) {
            const start = new Date(ass.start_date);
            const end = new Date(ass.end_date);
            
            // Loop through each day in the range
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                const isWeekend = [0, 6].includes(d.getDay());
                if (isWeekend) continue; // Skip weekends

                await client.query(`
                    INSERT INTO time_entries (task_id, user_name, user_dept, user_email, project_name, project_code, entry_date, hours, minutes, remarks)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [leaveTaskId, ass.user_name, ass.user_dept, ass.user_email, ass.project_name, ass.project_code || 'PTO', dateStr, ass.allocation_hours, 0, remarks]);
            }
        }
    } catch (err) {
        console.error("Failed to sync assignment to time entries:", err);
    }
};
