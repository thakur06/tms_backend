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
        SELECT id, name, email, dept, created_at
        FROM users
        ORDER BY created_at DESC
      `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};
