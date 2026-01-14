const pool = require("../db");

const ensurePasswordResetOtpTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_otps (
        email TEXT PRIMARY KEY,
        otp_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log("✅ password_reset_otps table ready");
  } catch (err) {
    console.error("❌ Failed to ensure password_reset_otps table", err);
    throw err;
  }
};

module.exports = { ensurePasswordResetOtpTable };

