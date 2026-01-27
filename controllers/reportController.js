const pool = require("../db");

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

// Get time entries report
exports.getTimeEntriesReport = async (req, res) => {
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
};

// Get total time for current week
exports.getCurrentWeekTotalTime = async (req, res) => {
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
};
