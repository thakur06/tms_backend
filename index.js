const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const ensureUsersTable = async () => {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          dept TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

        console.log("✅ Users table ready (created if not existed)");
    } catch (err) {
        console.error("❌ Failed to ensure users table", err);
        throw err;
    }
};

const ensureProjectsTable = async () => {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          code TEXT UNIQUE NOT NULL,
          location TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

        console.log("✅ projects table ready (created if not existed)");
    } catch (err) {
        console.error("❌ Failed to ensure projects table", err);
        throw err;
    }
};

const ensureTimeEntriesTable = async () => {
    try {
        const result = await pool.query(`
        CREATE TABLE IF NOT EXISTS time_entries (
          id SERIAL PRIMARY KEY,
          task_id TEXT NOT NULL,
          user_name TEXT,
          user_dept Text,
          user_email Text,
          project_name TEXT,
          project_code TEXT,
          location TEXT,
          remarks TEXT,
          client Text,
          entry_date DATE NOT NULL,
          hours INTEGER DEFAULT 0,
          minutes INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

        console.log("✅ Table check completed (created if not existed)");
    } catch (err) {
        console.error("❌ Failed to ensure table", err);
        throw err;
    }
};


// Insert a time entry
app.post("/api/time-entries", async (req, res) => {
    try {
        const { taskId, user, email, dept, project,project_code, location, remarks, date, hours = 0, minutes = 0 } = req.body;
        console.log(req.body)
        if (!taskId || !date) {
            return res.status(400).json({ error: "taskId and date are required" });
        }

        const result = await pool.query(
            `
      INSERT INTO time_entries (task_id, user_name,user_dept,user_email, project_name,project_code, location, remarks,client, entry_date, hours, minutes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9,$10,$11,$12)
      RETURNING *
      `,
            [taskId, user || null, dept || null, email || null, project || null,project_code || null, location || null, remarks || null, '', date, hours, minutes]
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
    }
    catch (err) {
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
    }
    catch (err) {
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
        const { taskId, hours, minutes, project, location, remarks, entry_date } = req.body;
        console.log(req.body)
        const result = await pool.query(
            `
        UPDATE time_entries
        SET task_id = $1,
            hours = $2,
            minutes = $3,
            project_name = $4,
            location = $5,
            remarks = $6,
            entry_date = $7
        WHERE id = $8
        RETURNING *
        `,
            [taskId, hours, minutes, project, location, remarks, entry_date, id]
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

app.get('/api/reports/time-entries', async (req, res) => {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'startDate and endDate are required' })
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
        )

        // ---- Group by user and calculate totals ----
        const users = {}

        result.rows.forEach(row => {
            const user = row.user_name;
            const dept = row.user_dept;
            const email =row.user_email;
            if (!users[user]) {
                users[user] = {
                    user_name: user,
                    user_dept: dept,
                    user_email:email,
                    total_minutes: 0,
                    entries: []
                }
            }

            users[user].entries.push({
                date: row.entry_date,
                task_id: row.task_id,
                project: row.project_name,
                hours: row.hours,
                minutes: row.minutes,
                location: row.location,
                remarks: row.remarks,
                project_code:row.project_code,
                client:row.client
            })

            users[user].total_minutes += row.total_minutes
        })
        console.log(users)
        // Convert minutes → hours
        const response = Object.values(users).map(user => ({
            user_name: user.user_name,
            user_dept:user.user_dept,
            user_email:user.user_email,
            total_hours: Math.floor(user.total_minutes / 60),
            total_minutes: user.total_minutes % 60,
            entries: user.entries
        }))

        res.json({
            startDate,
            endDate,
            users: response
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Server error' })
    }
})


app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

Promise.all([ensureTimeEntriesTable(), ensureUsersTable(), ensureProjectsTable()])
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✅ API running on http://localhost:${PORT}`);
        });
    });

module.exports = app;
