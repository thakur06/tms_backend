const pool = require("../db");

// Get all user-project assignments with user and project details
exports.getAllAssignments = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const query = `
      SELECT 
        up.id,
        up.user_id,
        up.project_id,
        up.allocation_hours,
        up.start_date,
        up.end_date,
        up.created_at,
        up.updated_at,
        u.name as user_name,
        u.email as user_email,
        u.dept as user_dept,
        p.name as project_name,
        p.code as project_code,
        p.client as project_client
      FROM user_projects up
      INNER JOIN users u ON up.user_id = u.id
      INNER JOIN projects p ON up.project_id = p.id
      WHERE $1::DATE BETWEEN up.start_date AND up.end_date
      ORDER BY u.name, p.name
    `;
    
    const result = await pool.query(query, [targetDate]);
    
    // Group by user for easier frontend consumption
    const groupedByUser = result.rows.reduce((acc, row) => {
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
        allocation_hours: row.allocation_hours,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
      
      acc[userId].total_allocation += row.allocation_hours;
      
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
        up.start_date,
        up.end_date,
        up.created_at,
        up.updated_at,
        p.name as project_name,
        p.code as project_code,
        p.client as project_client,
        p.location as project_location
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
    
    if (allocation_hours < 0 || allocation_hours > 160) {
      return res.status(400).json({ error: "allocation_hours must be between 0 and 160" });
    }

    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: "Start date must be before or equal to end date" });
    }

    // 1. Check if assignment already exists for this User + Project
    const existingAssignmentRes = await pool.query(
        `SELECT id, allocation_hours, start_date, end_date 
         FROM user_projects 
         WHERE user_id = $1 AND project_id = $2`,
        [user_id, project_id]
    );

    // If it exists, we prepare for a MERGE (Update)
    if (existingAssignmentRes.rows.length > 0) {
        const existing = existingAssignmentRes.rows[0];
        
        // Calculate merged values
        const newAllocation = existing.allocation_hours + parseInt(allocation_hours);
        
        const proposedStart = new Date(start_date);
        const proposedEnd = new Date(end_date);
        const currentStart = new Date(existing.start_date);
        const currentEnd = new Date(existing.end_date);

        const mergedStartDate = proposedStart < currentStart ? start_date : existing.start_date;
        const mergedEndDate = proposedEnd > currentEnd ? end_date : existing.end_date;

        // Validate 160h Cap for the MERGED scenario
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
            [mergedStartDate, mergedEndDate, user_id, existing.id]
        );

        const currentMax = overlappingCheck.rows.length > 0 ? parseInt(overlappingCheck.rows[0].max_allocation) : 0;
        
        if (currentMax + newAllocation > 160) {
             return res.status(400).json({ 
                error: `Merging would exceed 160 monthly hours. 
                        Merged Hours: ${newAllocation}h. 
                        Max Other Hours in range: ${currentMax}h. 
                        Total: ${currentMax + newAllocation}h` 
            });
        }

        // Perform Update
        const updateQuery = `
            UPDATE user_projects 
            SET allocation_hours = $1, start_date = $2, end_date = $3, updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `;
        const updateResult = await pool.query(updateQuery, [newAllocation, mergedStartDate, mergedEndDate, existing.id]);
        
        return res.status(200).json({
            success: true,
            message: "Assignment merged successfully",
            data: updateResult.rows[0]
        });

    } else {
        // 2. New Assignment Logic
        
        // Check 160h Cap for NEW insert
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

        const currentMax = overlappingCheck.rows.length > 0 ? parseInt(overlappingCheck.rows[0].max_allocation) : 0;
        if (currentMax + parseInt(allocation_hours) > 160) {
          return res.status(400).json({ 
            error: `Total allocation would exceed 160h on some dates. Max existing: ${currentMax}h. Requested: ${allocation_hours}h` 
          });
        }
        
        // Insert new assignment
        const insertQuery = `
          INSERT INTO user_projects (user_id, project_id, allocation_hours, start_date, end_date)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        
        const result = await pool.query(insertQuery, [user_id, project_id, allocation_hours, start_date, end_date]);
        
        res.status(201).json({
          success: true,
          message: "Assignment created successfully",
          data: result.rows[0]
        });
    }

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
    const finalAllocation = allocation_hours !== undefined ? parseInt(allocation_hours) : assignment.allocation_hours;

    if (finalAllocation < 0 || finalAllocation > 160) {
      return res.status(400).json({ error: "allocation_hours must be between 0 and 160" });
    }

    if (new Date(finalStartDate) > new Date(finalEndDate)) {
      return res.status(400).json({ error: "Start date must be before or equal to end date" });
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

    const currentMax = parseInt(overlappingCheck.rows[0].max_allocation);
    if (currentMax + finalAllocation > 160) {
      return res.status(400).json({ 
        error: `Total allocation would exceed 160h on some dates. Maximum other: ${currentMax}h. Available: ${160 - currentMax}h` 
      });
    }
    
    // Update assignment
    const updateQuery = `
      UPDATE user_projects 
      SET allocation_hours = $1, start_date = $2, end_date = $3
      WHERE id = $4
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, [finalAllocation, finalStartDate, finalEndDate, id]);
    
    res.json({
      success: true,
      message: "Assignment updated successfully",
      data: result.rows[0]
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
