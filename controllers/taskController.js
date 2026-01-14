const pool = require("../db");

// Create a task
exports.createTask = async (req, res) => {
  try {
    const { task_name, task_dept } = req.body;
    const result = await pool.query(
      `
      INSERT INTO tasks (task_name, task_dept)
      VALUES ($1, $2)
      RETURNING *
      `,
      [task_name, task_dept]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Task already exists" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create task" });
  }
};

// Get all tasks
exports.getTasks = async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT task_id, task_name, task_dept FROM tasks ORDER BY task_id DESC
        `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

// Delete task and its time entries
exports.deleteTask = async (req, res) => {
  const client = await pool.connect();
  const { taskId } = req.params;

  try {
    await client.query("BEGIN");

    // 1️⃣ Delete related time entries
    await client.query(
      `DELETE FROM time_entries WHERE task_id = $1`,
      [taskId]
    );

    // 2️⃣ Delete task
    const taskResult = await client.query(
      `DELETE FROM tasks WHERE task_id = $1 RETURNING *`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Task not found" });
    }

    await client.query("COMMIT");

    res.json({
      message: "Task and related time entries deleted",
      task: taskResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  } finally {
    client.release(); 
  }
};
