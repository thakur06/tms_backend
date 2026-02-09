const pool = require("../db");
const { cache, redis } = require("../redis");

// Get all projects
exports.getProjects = async (req, res) => {
  try {
    const projects = await cache("projects:all", async () => {
      const result = await pool.query(`
        SELECT *
        FROM projects
        ORDER BY created_at DESC
      `);
      return result.rows;
    }, 600); // 10 mins cache

    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

// Create a project
exports.createProject = async (req, res) => {
  try {
    const { name, code, location, client, category = 'project', status = 'Active' } = req.body;
    
    // Provide defaults for code if null/undefined
    const projectCode = code || null;
    
    const result = await pool.query(
      `
      INSERT INTO projects (name, code, location, client, category, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (name) DO NOTHING
      RETURNING *
      `,
      [name, projectCode, location, client, category, status]
    );
    await redis.del("projects:all");
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
    const { name, client, location, status } = req.body;
    
    // Only update the 4 editable fields: name, client, location, status
    // Code and category remain unchanged
    const result = await pool.query(
      `
      UPDATE projects 
      SET name = $1, client = $2, location = $3, status = $4
      WHERE id = $5
      RETURNING *
      `,
      [name, client, location, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    await redis.del("projects:all");
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

    await redis.del("projects:all");
    res.json({
      message: "Project and all related time entries deleted",
      project: projectResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete project" });
  }
};
