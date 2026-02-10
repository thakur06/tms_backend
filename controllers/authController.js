const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { sendEmail, otpEmailTemplate } = require("../utils/email");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }

        // Find user by email and count direct reports
        const result = await pool.query(
            `SELECT 
                u.id, u.name, u.email, u.dept, u.password, u.role, u.is_manager,
                (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count
             FROM users u 
             WHERE u.email = $1`,
            [email.toLowerCase().trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }

        const user = result.rows[0];

        // Check if user has a password set
        if (!user.password) {
            // If no password is set, allow login with any password (for initial setup)
            // In production, you might want to require password reset
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role, is_manager: user.is_manager === true }, 
                process.env.JWT_SECRET || 'your-secret-key', 
                { expiresIn: '30d' }
            );
            return res.json({ 
                success: true, 
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    dept: user.dept,
                    role: user.role,
                    isManager: user.is_manager === true,
                    reportsCount: parseInt(user.reports_count) || 0
                }
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, is_manager: user.is_manager === true }, 
            process.env.JWT_SECRET || 'your-secret-key', 
            { expiresIn: '30d' }
        );

        res.json({ 
            success: true, 
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                dept: user.dept,
                role: user.role,
                isManager: user.is_manager === true,
                reportsCount: parseInt(user.reports_count) || 0
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
};

exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Ensure user exists (avoid leaking whether user exists? Here we keep message generic)
        const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
        if (userResult.rows.length === 0) {
            return res.json({ success: true, message: "If the email exists, an OTP has been sent." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Upsert OTP (one active OTP per email)
        await pool.query(
            `
            INSERT INTO password_reset_otps (email, otp_hash, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (email) DO UPDATE
              SET otp_hash = EXCLUDED.otp_hash,
                  expires_at = EXCLUDED.expires_at,
                  created_at = NOW()
            `,
            [normalizedEmail, otpHash, expiresAt]
        );

        const tmpl = otpEmailTemplate({
            appName: process.env.APP_NAME || "TMS",
            email: normalizedEmail,
            otp,
            minutes: 5,
        });

        await sendEmail({
            to: normalizedEmail,
            subject: tmpl.subject,
            text: tmpl.text,
            html: tmpl.html,
        });

        res.json({ success: true, message: "OTP sent to email (valid for 5 minutes)" });
    } catch (err) {
        console.error("sendOTP error:", err);
        res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "Email and otp are required" });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const otpRow = await pool.query(
            `SELECT otp_hash, expires_at FROM password_reset_otps WHERE email = $1`,
            [normalizedEmail]
        );

        if (otpRow.rows.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        const { otp_hash, expires_at } = otpRow.rows[0];
        if (new Date(expires_at).getTime() < Date.now()) {
            await pool.query(`DELETE FROM password_reset_otps WHERE email = $1`, [normalizedEmail]);
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        const ok = await bcrypt.compare(String(otp), otp_hash);
        if (!ok) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        // Issue short-lived reset token (encrypted/signed JWT)
        const resetToken = jwt.sign(
            { email: normalizedEmail, purpose: "password_reset" },
            process.env.JWT_SECRET || "your-secret-key",
            { expiresIn: "10m" }
        );

        return res.json({ success: true, message: "OTP Verified", resetToken });
    } catch (err) {
        console.error("verifyOTP error:", err);
        res.status(500).json({ success: false, message: "Failed to verify OTP" });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;

        if (!resetToken || !newPassword) {
            return res.status(400).json({ success: false, message: "resetToken and newPassword are required" });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });
        }

        let decoded;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_SECRET || "your-secret-key");
        } catch (e) {
            return res.status(401).json({ success: false, message: "Invalid or expired reset token" });
        }

        if (decoded.purpose !== "password_reset" || !decoded.email) {
            return res.status(401).json({ success: false, message: "Invalid reset token" });
        }

        const normalizedEmail = decoded.email.toLowerCase().trim();

        // Require an OTP record to exist (ensures OTP was recently verified); then delete it on success
        const otpRow = await pool.query(`SELECT email FROM password_reset_otps WHERE email = $1`, [normalizedEmail]);
        if (otpRow.rows.length === 0) {
            return res.status(400).json({ success: false, message: "OTP verification required" });
        }

        const hashedPassword = await bcrypt.hash(String(newPassword), 10);
        await pool.query(`UPDATE users SET password = $1 WHERE email = $2`, [hashedPassword, normalizedEmail]);
        await pool.query(`DELETE FROM password_reset_otps WHERE email = $1`, [normalizedEmail]);

        return res.json({ success: true, message: "Password reset successfully" });
    } catch (err) {
        console.error("resetPassword error:", err);
        res.status(500).json({ success: false, message: "Failed to reset password" });
    }
};

exports.setPassword = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters long' 
            });
        }

        // Find user by email
        const userResult = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase().trim()]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Update user password
        await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2',
            [hashedPassword, email.toLowerCase().trim()]
        );

        res.json({ 
            success: true, 
            message: 'Password set successfully' 
        });
    } catch (error) {
        console.error('Set password error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while setting password' 
        });
    }
};