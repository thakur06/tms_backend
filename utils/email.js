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

// --- Email Styling Helper ---
function getBaseHtml(appName, title, bodyContent) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; color: #1f2937; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .header { background-color: #09090b; padding: 30px 40px; text-align: center; border-bottom: 4px solid #f59e0b; }
        .header h1 { margin: 0; color: #f59e0b; font-size: 24px; letter-spacing: 1px; text-transform: uppercase; }
        .content { padding: 40px; line-height: 1.6; font-size: 16px; color: #374151; }
        .footer { background-color: #f4f4f5; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
        .highlight { color: #d97706; font-weight: 700; }
        .button { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #000000; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
        .otp-box { background-color: #fef3c7; border: 2px dashed #f59e0b; color: #92400e; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; padding: 15px; margin: 20px 0; border-radius: 8px; }
        .alert-box { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; color: #991b1b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${escapeHtml(appName)}</h1>
        </div>
        <div class="content">
          ${bodyContent}
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${escapeHtml(appName)}. All rights reserved.<br>
          This is an automated message, please do not reply.
        </div>
      </div>
    </body>
    </html>
  `;
}

function credentialsEmailTemplate({ appName, email, password }) {
  const safeApp = appName || "TMS";
  const subject = `${safeApp} - Welcome to your new account`;
  
  const body = `
    <h2 style="color: #111827; margin-top: 0;">Welcome Aboard! 🚀</h2>
    <p>Your account for <b>${safeApp}</b> has been successfully created.</p>
    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Username:</strong> ${escapeHtml(email)}</p>
      <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 2px 6px; rounded: 4px; color: #d97706;">${escapeHtml(password)}</code></p>
    </div>
    <p>Please login immediately and change your password to secure your account.</p>
  `;

  return { 
    subject, 
    text: `Welcome to ${safeApp}. Email: ${email}, Password: ${password}`, 
    html: getBaseHtml(safeApp, "Welcome", body) 
  };
}

function otpEmailTemplate({ appName, email, otp, minutes }) {
  const safeApp = appName || "TMS";
  const ttl = minutes || 5;
  const subject = `${safeApp} - Password Reset Request`;

  const body = `
    <h2 style="color: #111827; margin-top: 0;">Reset Your Password</h2>
    <p>We received a request to reset the password for <b>${escapeHtml(email)}</b>.</p>
    <p>Use the following One-Time Password (OTP) to complete the process:</p>
    
    <div class="otp-box">${escapeHtml(otp)}</div>
    
    <p>This code is valid for <strong>${ttl} minutes</strong>.</p>
    <p style="font-size: 14px; color: #6b7280;">If you did not request a password reset, you can safely ignore this email.</p>
  `;

  return { 
    subject, 
    text: `Your ${safeApp} OTP is ${otp}. Valid for ${ttl} minutes.`, 
    html: getBaseHtml(safeApp, "Password Reset", body) 
  };
}

function lowHoursEmailTemplate({ appName, name, hours, startStr, endStr }) {
  const safeApp = appName || "TMS";
  const subject = `${safeApp} - ⚠️ Action Required: Timesheet Alert`;

  const body = `
    <h2 style="color: #991b1b; margin-top: 0;">Timesheet Compliance Alert</h2>
    <p>Hello <b>${escapeHtml(name)}</b>,</p>
    
    <div class="alert-box">
      <p style="margin: 0;"><strong>Issue: Low Hours Logged</strong></p>
      <p style="margin: 5px 0 0 0;">You logged <span style="font-size: 18px; font-weight: bold;">${Number(hours).toFixed(1)} hours</span> for the week of ${startStr} to ${endStr}.</p>
    </div>

    <p>The required target is <strong>40 hours per week</strong>.</p>
    <p>Please ensure your timesheet is updated immediately to reflect your actual working hours. Accurate time logging is crucial for project tracking and billing.</p>
    
    <div style="margin-top: 30px; text-align: center;">
      <span style="font-size: 14px; color: #6b7280;">Your reporting manager has been copied on this alert.</span>
    </div>
  `;

  return {
    subject,
    text: `Alert: You only logged ${hours} hours last week. Please update your timesheet.`,
    html: getBaseHtml(safeApp, "Timesheet Alert", body)
  };
}

module.exports = { 
  sendEmail, 
  credentialsEmailTemplate, 
  otpEmailTemplate, 
  lowHoursEmailTemplate 
};

