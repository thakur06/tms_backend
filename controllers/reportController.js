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

// Helper to build WHERE clause dynamically
const buildWhereClause = (startDate, endDate, projects, users, locations, depts) => {
  const params = [startDate, endDate];
  let query = ` WHERE entry_date BETWEEN $1 AND $2 `;
  let paramIdx = 3;

  if (projects && projects.length > 0) {
    query += ` AND project_name = ANY($${paramIdx}) `;
    params.push(projects);
    paramIdx++;
  }

  if (users && users.length > 0) {
    query += ` AND user_name = ANY($${paramIdx}) `;
    params.push(users);
    paramIdx++;
  }

  if (locations && locations.length > 0) {
    query += ` AND location = ANY($${paramIdx}) `;
    params.push(locations);
    paramIdx++;
  }

  if (depts && depts.length > 0) {
    query += ` AND user_dept = ANY($${paramIdx}) `;
    params.push(depts);
    paramIdx++;
  }

  return { query, params };
};

// Get time entries report
exports.getTimeEntriesReport = async (req, res) => {
  const { startDate, endDate, projects, users, locations, depts } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate and endDate are required" });
  }

  try {
    // Parse JSON arrays if passed as strings (axios params might need this if not using repeats)
    // Express query parser usually handles arrays if format is ?projects[]=A&projects[]=B
    // But let's ensure we handle comma-separated strings if that's how frontend sends it, 
    // or just assume direct arrays if standard qs is used. 
    // For safety, let's normalize to arrays if they are strings.
    const parseArray = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return [val]; // Single value
    };

    const projectArr = parseArray(projects);
    const userArr = parseArray(users);
    const locationArr = parseArray(locations);
    const deptArr = parseArray(depts);

    const { query: whereClause, params } = buildWhereClause(
        startDate, endDate, projectArr, userArr, locationArr, deptArr
    );

    const sql = `
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
        ${whereClause}
        ORDER BY user_name, entry_date ASC
    `;

    const result = await pool.query(sql, params);

    // ---- Group by user and calculate totals ----
    const usersData = {};

    result.rows.forEach((row) => {
      const user = row.user_name;
      const dept = row.user_dept;
      const email = row.user_email;
      if (!usersData[user]) {
        usersData[user] = {
          user_name: user,
          user_dept: dept,
          user_email: email,
          total_minutes: 0,
          entries: [],
        };
      }

      usersData[user].entries.push({
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

      usersData[user].total_minutes += row.total_minutes;
    });

    const response = Object.values(usersData).map((user) => ({
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

const ExcelJS = require('exceljs');


exports.exportTimeEntriesExcel = async (req, res) => {
    const { startDate, endDate, projects, users, locations, depts } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
    }

    try {
        const parseArray = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            return [val];
        };

        const projectArr = parseArray(projects);
        const userArr = parseArray(users);
        const locationArr = parseArray(locations);
        const deptArr = parseArray(depts);

        const { query: whereClause, params } = buildWhereClause(
            startDate, endDate, projectArr, userArr, locationArr, deptArr
        );

        const sql = `
            SELECT 
              entry_date,
              user_name,
              user_dept,
              user_email,
              project_name,
              project_code,
              task_id,
              hours,
              minutes,
              remarks,
              location,
              client
            FROM time_entries
            ${whereClause}
            ORDER BY user_name ASC, entry_date ASC
        `;

        const result = await pool.query(sql, params);

        // Process data for Summary
        const userSummary = {};
        result.rows.forEach(row => {
            if (!userSummary[row.user_name]) {
                userSummary[row.user_name] = {
                    name: row.user_name,
                    email: row.user_email,
                    dept: row.user_dept,
                    entries: 0,
                    totalMinutes: 0
                };
            }
            userSummary[row.user_name].entries++;
            userSummary[row.user_name].totalMinutes += (row.hours * 60) + row.minutes;
        });

        // Create Workbook
        const workbook = new ExcelJS.Workbook();
        
        // --- SUMMARY SHEET ---
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'User', key: 'name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Department', key: 'dept', width: 20 },
            { header: 'Total Entries', key: 'entries', width: 15 },
            { header: 'Total Hours', key: 'totalHours', width: 15 },
        ];
        
        summarySheet.getRow(1).font = { bold: true };
        
        Object.values(userSummary).forEach(u => {
            const h = Math.floor(u.totalMinutes / 60);
            const m = u.totalMinutes % 60;
            summarySheet.addRow({
                name: u.name,
                email: u.email,
                dept: u.dept,
                entries: u.entries,
                totalHours: `${h}h ${m}m`
            });
        });

        // --- DETAILED SHEET ---
        const worksheet = workbook.addWorksheet('Detailed Entries');

        // Columns matching TimeReport.jsx style roughly
        worksheet.columns = [
            { header: 'User', key: 'user', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Department', key: 'dept', width: 15 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Task ID', key: 'task', width: 20 },
            { header: 'Project', key: 'project', width: 25 },
            { header: 'Hours', key: 'hours', width: 10 },
            { header: 'Minutes', key: 'minutes', width: 10 },
            { header: 'Location', key: 'location', width: 20 },
            { header: 'Remarks', key: 'remarks', width: 30 },
            { header: 'Client', key: 'client', width: 20 },
        ];

        // Style Header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEFF6FF' } // Light blueish
        };

        // Add Data
        result.rows.forEach(row => {
            worksheet.addRow({
                user: row.user_name,
                email: row.user_email,
                dept: row.user_dept,
                date: new Date(row.entry_date).toLocaleDateString(),
                task: row.task_id,
                project: row.project_name,
                hours: row.hours,
                minutes: row.minutes,
                location: row.location,
                remarks: row.remarks,
                client: row.client
            });
        });

        // Response Headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=TimeReport_${startDate}_to_${endDate}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to generate Excel report" });
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
