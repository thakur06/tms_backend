const express = require("express");
const cors = require("cors");
const pool = require("./db");
const compression = require("compression");
const {seedProjectsFromExcel} = require("./seeds/projectSeedings");
const { ensureDeptTable } = require("./validators/deptSchema");
const { ensureTasksTable } = require("./validators/tasksSchema");
const { ensureUsersTable } = require("./validators/userSchema");
const { ensureProjectsTable } = require("./validators/projectsSchema");
const { ensureTimeEntriesTable } = require("./validators/timeEntriesSchema");
const { ensureClientsTable } = require("./validators/clientSchema");
const {seedUsersFromExcel}=require("./seeds/userSeedings");
const {seedTasksFromExcel}=require("./seeds/taskSeedings");
const {seedClientsFromExcel}=require("./seeds/clientSeedings");
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(compression());
// Helper function to format time
const formatTime = (hours, minutes) => {
  if (hours === 0 && minutes === 0) return "0 hours";
  if (hours === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (minutes === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
};

// Helper to get current week dates (Monday to Sunday)
const getCurrentWeekDates = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate Monday of current week
  const monday = new Date(now);
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  
  // Calculate Sunday of current week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
};
// Insert a time entry
app.post("/api/time-entries", async (req, res) => {
  try {
    const {
      taskId,
      user,
      email,
      dept,
      project,
      project_code,
      country,
      remarks,
      date,
      hours = 0,
      minutes = 0,
      client
    } = req.body;
    console.log(req.body);
    if (!taskId || !date) {
      return res.status(400).json({ error: "taskId and date are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO time_entries (task_id, user_name,user_dept,user_email, project_name,project_code, location, remarks,client, entry_date, hours, minutes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        taskId,
        user || null,
        dept || null,
        email || null,
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
});

// Get time entries for a given date or week range
app.get("/api/time-entries", async (req, res) => {
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
});

// Create a user

app.post("/api/users", async (req, res) => {
  try {
    const { name, email, dept } = req.body;

    const result = await pool.query(
      `
        INSERT INTO users (name, email, dept)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING
        RETURNING *
        `,
      [name, email, dept]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT id, name, email, dept, created_at
        FROM users
        ORDER BY created_at DESC
      `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get all projects
app.get("/api/projects", async (req, res) => {
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
});

// Create a project
app.post("/api/projects", async (req, res) => {
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
});

// Get time entries by user (by name)
app.get("/api/time-entries/user/:userName", async (req, res) => {
  try {
    const { userName } = req.params;

    const result = await pool.query(
      `
        SELECT *
        FROM time_entries
        WHERE user_name = $1
        ORDER BY entry_date DESC, created_at DESC
        `,
      [userName]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user time entries" });
  }
});

// DELETE /api/time-entries/:id
app.delete("/api/time-entries/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM time_entries WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    res.json({ message: "Time entry deleted", deleted: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete time entry" });
  }
});

// PUT /api/time-entries/:id
app.put("/api/time-entries/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { taskId, hours, minutes, project, country, remarks, entry_date,client } =
      req.body;
    console.log(req.body);
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
      [taskId, hours, minutes, project, country, remarks, entry_date,client, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update time entry" });
  }
});

// get all user time enteries report

app.get("/api/reports/time-entries", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ message: "startDate and endDate are required" });
  }

  try {
    const result = await pool.query(
      `
        SELECT 
          user_name,
          user_dept,
          user_email,
          entry_date,
          task_id,
          client,
          project_name,
          project_code,
          location,
          remarks,
          hours,
          minutes,
          (hours * 60 + minutes) AS total_minutes
        FROM time_entries
        WHERE entry_date BETWEEN $1 AND $2
        ORDER BY user_name, entry_date ASC
        `,
      [startDate, endDate]
    );

    // ---- Group by user and calculate totals ----
    const users = {};

    result.rows.forEach((row) => {
      const user = row.user_name;
      const dept = row.user_dept;
      const email = row.user_email;
      if (!users[user]) {
        users[user] = {
          user_name: user,
          user_dept: dept,
          user_email: email,
          total_minutes: 0,
          entries: [],
        };
      }

      users[user].entries.push({
        date: row.entry_date,
        task_id: row.task_id,
        project: row.project_name,
        hours: row.hours,
        minutes: row.minutes,
        location: row.location,
        remarks: row.remarks,
        project_code: row.project_code,
        client: row.client,
      });

      users[user].total_minutes += row.total_minutes;
    });
    console.log(users);
    // Convert minutes → hours
    const response = Object.values(users).map((user) => ({
      user_name: user.user_name,
      user_dept: user.user_dept,
      user_email: user.user_email,
      total_hours: Math.floor(user.total_minutes / 60),
      total_minutes: user.total_minutes % 60,
      entries: user.entries,
    }));

    res.json({
      startDate,
      endDate,
      users: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/tasks", async (req, res) => {
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
});

app.get("/api/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT task_id, task_name, task_dept FROM tasks ORDER BY task_id DESC
        `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// DELETE project and its time entries
app.delete("/api/projects/:projectCode", async (req, res) => {
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
  });
  
  
// DELETE task and its time entries
app.delete("/api/tasks/:taskId", async (req, res) => {
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
  }});
 
  app.get('/total-time/current-week', async (req, res) => {
  try {
    const { monday, sunday } = getCurrentWeekDates();
    
    const query = `
      SELECT 
        SUM(hours) as total_hours,
        SUM(minutes) as total_minutes
      FROM time_entries
      WHERE entry_date BETWEEN $1 AND $2
    `;
    
    const result = await pool.query(query, [monday, sunday]);
    const totalHours = parseInt(result.rows[0].total_hours) || 0;
    const totalMinutes = parseInt(result.rows[0].total_minutes) || 0;
    
    // Convert excess minutes to hours
    const extraHours = Math.floor(totalMinutes / 60);
    const finalHours = totalHours + extraHours;
    const finalMinutes = totalMinutes % 60;
    
    const formattedTotal = formatTime(finalHours, finalMinutes);
    
    res.json({
      week_start: monday.toISOString().split('T')[0],
      week_end: sunday.toISOString().split('T')[0],
      total_hours: finalHours,
      total_minutes: finalMinutes,
      formatted: formattedTotal,
      total_in_minutes: (finalHours * 60) + finalMinutes,
      decimal_hours: finalHours + (finalMinutes / 60)
    });
    
  } catch (error) {
    console.error('Error calculating current week total time:', error);
    res.status(500).json({
      error: 'Failed to calculate current week total time',
      details: error.message
    });
  }
});

app.post("/api/dept", async (req, res) => {
  try {
    const { dept_name } = req.body;
    const result = await pool.query(
       `
      INSERT INTO departments (dept_name)
      VALUES ($1)
      RETURNING *
      `,
      [dept_name]
     
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Fail to add dept" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add department" });
  }
});

app.get("/api/dept", async (req, res) => {
  try {
    
    const result = await pool.query(
      `
      Select * from departments
      `
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "No dept found" });
    }

    res.status(201).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch departments " });
  }
});

app.post("/api/client", async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
       `
      INSERT INTO clients (name)
      VALUES ($1)
      RETURNING *
      `,
      [name]
     
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Fail to add client" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add client" });
  }
});

app.get("/api/client", async (req, res) => {
  try {
    
    const result = await pool.query(
      `
      Select * from clients
      `
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "No client found" });
    }

    res.status(201).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client " });
  }
});



app.post("/projects/seed", async (req, res) => {
  try {
    await seedProjectsFromExcel();
    await seedUsersFromExcel();
    await seedTasksFromExcel();
    await seedClientsFromExcel();
    res.json({ message: "✅ Projects seeded successfully" });
  } catch (err) {
    res.status(500).json({ message: "❌ Seeding failed" });
  }
});

  
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

Promise.all([
  ensureProjectsTable(),
  ensureTimeEntriesTable(),
  ensureUsersTable(),
  ensureTasksTable(),
  ensureDeptTable(),
  ensureClientsTable()
]).then(() => {
  app.listen(PORT, () => {
    console.log(`✅ API running on http://localhost:${PORT}`);
  });
});

module.exports = app;
