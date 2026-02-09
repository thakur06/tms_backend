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
        up.allocation_percentage,
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
        allocation_percentage: row.allocation_percentage,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
      
      acc[userId].total_allocation += row.allocation_percentage;
      
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
        up.allocation_percentage,
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
    
    const totalAllocation = result.rows.reduce((sum, row) => sum + row.allocation_percentage, 0);
    
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

// Create new assignment
exports.createAssignment = async (req, res) => {
  try {
    const { user_id, project_id, allocation_percentage, start_date, end_date } = req.body;
    
    // Validation
    if (!user_id || !project_id || allocation_percentage === undefined || !start_date || !end_date) {
      return res.status(400).json({ error: "user_id, project_id, allocation_percentage, start_date, and end_date are required" });
    }
    
    if (allocation_percentage < 0 || allocation_percentage > 100) {
      return res.status(400).json({ error: "allocation_percentage must be between 0 and 100" });
    }
    
    // Check for overlapping assignments for the SAME project
    // Actually, the user says "if end date is passed user will be free", 
    // but they might want multiple assignments for DIFFERENT projects.
    // The 100% check must be for ANY date within the range.
    // This is complex. For now, let's validate against any date in the new range.
    
    const overlappingCheck = await pool.query(
      `SELECT COALESCE(MAX(current_day_allocation), 0) as max_allocation
       FROM (
         SELECT generate_series($1::date, $2::date, '1 day'::interval) as day
       ) d
       CROSS JOIN LATERAL (
         SELECT SUM(allocation_percentage) as current_day_allocation
         FROM user_projects
         WHERE user_id = $3
         AND d.day BETWEEN start_date AND end_date
       ) up`,
      [start_date, end_date, user_id]
    );

    const currentMax = overlappingCheck.rows.length > 0 ? parseInt(overlappingCheck.rows[0].max_allocation) : 0;
    if (currentMax + allocation_percentage > 100) {
      return res.status(400).json({ 
        error: `Total allocation would exceed 100% on some dates in this range. Maximum existing allocation: ${currentMax}%. Available: ${100 - currentMax}%` 
      });
    }
    
    // Insert new assignment
    const insertQuery = `
      INSERT INTO user_projects (user_id, project_id, allocation_percentage, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(insertQuery, [user_id, project_id, allocation_percentage, start_date, end_date]);
    
    res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Failed to create assignment:", err);
    
    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(409).json({ error: "This user is already assigned to this project" });
    }
    
    res.status(500).json({ error: "Failed to create assignment" });
  }
};

// Update assignment
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { allocation_percentage, start_date, end_date } = req.body;
    
    // Get current assignment
    const currentAssignmentQuery = await pool.query(
      "SELECT user_id, start_date, end_date FROM user_projects WHERE id = $1",
      [id]
    );
    
    if (currentAssignmentQuery.rows.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    
    const assignment = currentAssignmentQuery.rows[0];
    const targetUserId = assignment.user_id;
    const finalStartDate = start_date || assignment.start_date;
    const finalEndDate = end_date || assignment.end_date;
    const finalAllocation = allocation_percentage !== undefined ? allocation_percentage : assignment.allocation_percentage;

    if (finalAllocation < 0 || finalAllocation > 100) {
      return res.status(400).json({ error: "allocation_percentage must be between 0 and 100" });
    }
    
    // Check total allocation excluding current assignment for the new date range
    const overlappingCheck = await pool.query(
      `SELECT COALESCE(MAX(current_day_allocation), 0) as max_allocation
       FROM (
         SELECT generate_series($1::date, $2::date, '1 day'::interval) as day
       ) d
       CROSS JOIN LATERAL (
         SELECT SUM(allocation_percentage) as current_day_allocation
         FROM user_projects
         WHERE user_id = $3
         AND id != $4
         AND d.day BETWEEN start_date AND end_date
       ) up`,
      [finalStartDate, finalEndDate, targetUserId, id]
    );

    const currentMax = parseInt(overlappingCheck.rows[0].max_allocation);
    if (currentMax + finalAllocation > 100) {
      return res.status(400).json({ 
        error: `Total allocation would exceed 100% on some dates in this range. Maximum other allocation: ${currentMax}%. Available: ${100 - currentMax}%` 
      });
    }
    
    // Update assignment
    const updateQuery = `
      UPDATE user_projects 
      SET allocation_percentage = $1, start_date = $2, end_date = $3
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
