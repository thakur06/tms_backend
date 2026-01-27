const pool = require("../db");
const { sendEmail, lowHoursEmailTemplate } = require("../utils/email");

// Helper to get previous week's Mon-Sun
function getPreviousWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
  const currentWeekMonday = new Date(today.setDate(diffToMonday));
  
  const prevWeekMonday = new Date(currentWeekMonday);
  prevWeekMonday.setDate(currentWeekMonday.getDate() - 7);
  
  const prevWeekSunday = new Date(prevWeekMonday);
  prevWeekSunday.setDate(prevWeekMonday.getDate() + 6);

  return {
    start: prevWeekMonday.toISOString().split('T')[0],
    end: prevWeekSunday.toISOString().split('T')[0]
  };
}

// Check and notify low hours logic (separated for cron usage)
async function checkAndNotifyLowHours() {
  const { start, end } = getPreviousWeekRange();
  
  // Aggregate hours per user for the previous week
  // Note: hours + minutes/60
  const query = `
    SELECT 
      u.name, 
      u.email, 
      m.email as manager_email,
      COALESCE(SUM(te.hours + te.minutes::float/60), 0) as total_hours
    FROM users u
    LEFT JOIN users m ON u.reporting_manager_id = m.id
    LEFT JOIN time_entries te 
      ON u.email = te.user_email 
      AND te.entry_date BETWEEN $1 AND $2
    GROUP BY u.id, u.name, u.email, m.email
  `;
  
  const result = await pool.query(query, [start, end]);
  const lowHourUsers = result.rows.filter(row => row.total_hours < 40);
  const notificationsSent = [];

  // Send emails
  for (const user of lowHourUsers) {
    if (user.email) {
      try {
        const appName = process.env.APP_NAME || "TMS";
        
        // Use unified email template
        const { subject, text, html } = lowHoursEmailTemplate({
          appName,
          name: user.name,
          hours: user.total_hours,
          startStr: start,
          endStr: end
        });

        // Include Manager in CC if available
        const cc = user.manager_email || undefined;
        
        await sendEmail({ to: user.email, subject, text, html, cc });
        notificationsSent.push({ email: user.email, status: 'sent' });
      } catch (mailErr) {
        console.error(`Failed to email ${user.email}`, mailErr);
        notificationsSent.push({ email: user.email, status: 'failed' });
      }
    }
  }

  return {
    weekRange: { start, end },
    totalUsersChecked: result.rows.length,
    lowHourUsersCount: lowHourUsers.length,
    details: lowHourUsers.map(u => ({ name: u.name, hours: u.total_hours })),
    notifications: notificationsSent
  };
}

// Controller wrapper
exports.checkWeeklyHours = async (req, res) => {
  try {
    const result = await checkAndNotifyLowHours();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check weekly hours" });
  }
};

exports.checkAndNotifyLowHours = checkAndNotifyLowHours;
