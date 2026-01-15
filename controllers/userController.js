const pool = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendEmail, credentialsEmailTemplate } = require("../utils/email");

// Create a user
exports.createUser = async (req, res) => {
  try {
    const { name, email, dept } = req.body;

    if (!name || !email || !dept) {
      return res.status(400).json({ error: "name, email, dept are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Generate a random initial password (do NOT store plaintext)
    const plainPassword = crypto.randomBytes(9).toString("base64url"); // ~12 chars
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const result = await pool.query(
      `
        INSERT INTO users (name, email, dept, password)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, dept, created_at
        `,
      [name, normalizedEmail, dept, passwordHash]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Email credentials (encrypted in transit via SMTP TLS; password stored hashed in DB)
    try {
      const tmpl = credentialsEmailTemplate({
        appName: process.env.APP_NAME || "TMS",
        email: normalizedEmail,
        password: plainPassword,
      });
      await sendEmail({
        to: normalizedEmail,
        subject: tmpl.subject,
        text: tmpl.text,
        html: tmpl.html,
      });
    } catch (mailErr) {
      // User created but email failed
      console.error("Failed to send credentials email:", mailErr);
      return res.status(201).json({
        ...result.rows[0],
        emailSent: false,
        warning:
          "User created, but failed to send credentials email. Check SMTP config.",
      });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
        SELECT 
          u.id, 
          u.name, 
          u.email, 
          u.dept, 
          u.created_at, 
          u.is_manager, 
          u.reporting_manager_id,
          m.name as manager_name
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        ORDER BY u.created_at DESC
      `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// Assign reporting manager to a user
exports.assignReportingManager = async (req, res) => {
  try {
    const { id } = req.params;
    const { managerId } = req.body;

    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // If managerId is null, we're removing the manager
    if (managerId === null) {
      const result = await pool.query(
        `UPDATE users SET reporting_manager_id = NULL WHERE id = $1 RETURNING id, name, email, dept, reporting_manager_id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        message: "Reporting manager removed",
        user: result.rows[0]
      });
    }

    // Verify manager exists and is marked as manager
    const managerCheck = await pool.query(
      'SELECT id, is_manager FROM users WHERE id = $1',
      [managerId]
    );

    if (managerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Manager not found" });
    }

    if (!managerCheck.rows[0].is_manager) {
      return res.status(400).json({ 
        error: "Selected user is not marked as a manager. Please update their manager status first." 
      });
    }

    // Prevent self-assignment
    if (parseInt(id) === parseInt(managerId)) {
      return res.status(400).json({ error: "User cannot be their own manager" });
    }

    // Update user's reporting manager
    const result = await pool.query(
      `UPDATE users SET reporting_manager_id = $1 WHERE id = $2 
       RETURNING id, name, email, dept, reporting_manager_id`,
      [managerId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Reporting manager assigned successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign reporting manager" });
  }
};

// Get all users marked as managers
exports.getAvailableManagers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, dept, is_manager
      FROM users
      WHERE is_manager = true
      ORDER BY name ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch managers" });
  }
};

// Get team members (users reporting to a specific manager)
exports.getTeamMembers = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT id, name, email, dept, reporting_manager_id, created_at
      FROM users
      WHERE reporting_manager_id = $1
      ORDER BY name ASC
    `, [id]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
};

// Update user manager status
exports.updateManagerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isManager } = req.body;

    if (typeof isManager !== 'boolean') {
      return res.status(400).json({ error: "isManager must be a boolean value" });
    }

    const result = await pool.query(
      `UPDATE users SET is_manager = $1 WHERE id = $2 
       RETURNING id, name, email, dept, is_manager, reporting_manager_id`,
      [isManager, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: `User ${isManager ? 'promoted to' : 'removed from'} manager role`,
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update manager status" });
  }
};

// Update user details
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, dept } = req.body;

    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const result = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, dept = $3 
       WHERE id = $4 
       RETURNING id, name, email, dept, is_manager, reporting_manager_id`,
      [name, email, dept, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "User updated successfully",
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
};
