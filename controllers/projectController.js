const pool = require("../db");

// Get all projects
// Get all projects
exports.getProjects = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM projects
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

// Create a project
exports.createProject = async (req, res) => {
  try {
    const { name, location, client, category = 'project', status = 'Active' } = req.body;
    const result = await pool.query(
      `
      INSERT INTO projects (name, location, client, category, status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) DO NOTHING
      RETURNING *
      `,
      [name, location, client, category, status]
    );
    res.status(201).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create project" });
  }
};

// Update project
exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, client, category, status } = req.body;
    
    // Construct dynamic update or just fixed? Fixed is easier.
    const result = await pool.query(
      `
      UPDATE projects 
      SET name = $1, location = $2, client = $3, category = $4, status = $5
      WHERE id = $6
      RETURNING *
      `,
      [name, location, client, category, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update project" });
  }
};

// Delete project and its time entries
exports.deleteProject = async (req, res) => {
  try {
    const { projectCode } = req.params; // Note: projectCode is actually ID based on usage usually, but keeping var name for now or changing to id
    // Ideally we should use ID. The route says /:projectCode but the previous implementation used it as ID in the query ?
    // "DELETE FROM projects WHERE id = $1" -> yes it expects ID.
    
    // Delete project (time_entries auto-deleted via FK cascade)
    const projectResult = await pool.query(
      `DELETE FROM projects WHERE id = $1 RETURNING *`,
      [projectCode]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      message: "Project and all related time entries deleted",
      project: projectResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete project" });
  }
};
