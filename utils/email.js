const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_SECURE, SMTP_FROM)."
    );
  }

  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true"; // true for 465

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

async function sendEmail({ to, subject, html, text, cc }) {
  const transporter = getTransporter();
  const from = fromAddress();

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    cc,
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function credentialsEmailTemplate({ appName, email, password }) {
  const safeApp = escapeHtml(appName || "TMS");
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);

  const subject = `${safeApp} - Your account credentials`;
  const text =
    `${safeApp} account created.\n\n` +
    `Login Email: ${email}\n` +
    `Temporary Password: ${password}\n\n` +
    `Please login and change your password.`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2>${safeApp} account created</h2>
      <p>Your login credentials are:</p>
      <p><b>Email:</b> ${safeEmail}</p>
      <p><b>Temporary Password:</b> ${safePassword}</p>
      <p>Please login and change your password.</p>
    </div>
  `;

  return { subject, text, html };
}

function otpEmailTemplate({ appName, email, otp, minutes }) {
  const safeApp = escapeHtml(appName || "TMS");
  const safeEmail = escapeHtml(email);
  const safeOtp = escapeHtml(otp);
  const ttl = minutes || 5;

  const subject = `${safeApp} - Password reset OTP`;
  const text =
    `Password reset requested for ${safeApp}.\n\n` +
    `Email: ${email}\n` +
    `OTP: ${otp}\n\n` +
    `This OTP is valid for ${ttl} minutes. If you did not request this, ignore this email.`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2>${safeApp} Password Reset</h2>
      <p>We received a request to reset the password for <b>${safeEmail}</b>.</p>
      <p>Your OTP is:</p>
      <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700; margin: 16px 0">${safeOtp}</div>
      <p>This OTP is valid for <b>${ttl} minutes</b>.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}

module.exports = { sendEmail, credentialsEmailTemplate, otpEmailTemplate };

