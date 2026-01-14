const pool = require("../db");

// Get all projects
exports.getProjects = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, code, location, created_at
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
    const { name, code, location } = req.body;
    const result = await pool.query(
      `
      INSERT INTO projects (name, code, location)
      VALUES ($1, $2, $3)
      ON CONFLICT (code) DO NOTHING
      RETURNING *
      `,
      [name, code, location]
    );
    res.status(201).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create project" });
  }
};

// Delete project and its time entries
exports.deleteProject = async (req, res) => {
  try {
    const { projectCode } = req.params;
    console.log(projectCode)
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
