const pool = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendEmail, credentialsEmailTemplate } = require("../utils/email");

// Create a user
exports.createUser = async (req, res) => {
  try {
    const { name, email, dept, reporting_manager_id, role = 'employee' } = req.body;
    
    // Validate role
    const validRoles = ['admin', 'employee'];
    const userRole = validRoles.includes(role) ? role : 'employee';

    if (!name || !email || !dept) {
      return res.status(400).json({ error: "name, email, dept are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Generate a random initial password (do NOT store plaintext)
    const plainPassword = crypto.randomBytes(9).toString("base64url"); // ~12 chars
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const result = await pool.query(
      `
        INSERT INTO users (name, email, dept, password, reporting_manager_id, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, dept, reporting_manager_id, created_at, role
        `,
      [name, normalizedEmail, dept, passwordHash, reporting_manager_id || null, userRole]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    const newUser = result.rows[0];

    // Auto-promote reporting manager to is_manager = true if assigned
    if (reporting_manager_id) {
      await pool.query(
        'UPDATE users SET is_manager = true WHERE id = $1',
        [reporting_manager_id]
      );
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

// Get all users with pagination
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const dept = req.query.dept || 'All';

    let query = `
      SELECT 
        u.id, u.name, u.email, u.dept, u.created_at, u.role, u.reporting_manager_id,
        m.name as manager_name,
        (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count,
        COUNT(*) OVER() as total_count
      FROM users u
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    if (dept !== 'All') {
      params.push(dept);
      query += ` AND u.dept = $${params.length}`;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    res.json({
      users: result.rows,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    });
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

    // Verify manager exists
    const managerCheck = await pool.query(
      'SELECT id, is_manager FROM users WHERE id = $1',
      [managerId]
    );

    if (managerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Manager not found" });
    }

    // Auto-promote to manager if not already
    if (!managerCheck.rows[0].is_manager) {
      await pool.query('UPDATE users SET is_manager = true WHERE id = $1', [managerId]);
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
    const { name, email, dept, role } = req.body;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const result = await pool.query(
      'UPDATE users SET name = $1, email = $2, dept = $3, role = $4 WHERE id = $5 RETURNING *',
      [name, email, dept, role, id]
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
