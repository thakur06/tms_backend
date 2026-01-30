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
        if (Array.isArray(val)) return val.filter(Boolean);
        if (typeof val === 'string') {
            // Handle comma separated strings (e.g. from some serializers) or single values
            return val.split(',').map(s => s.trim()).filter(Boolean);
        }
        return [val]; // Single value non-string
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
        const sheet = workbook.addWorksheet('Time Report');

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 30 }, { width: 40 }, { width: 15 },
            { width: 50 }, { width: 50 }, { width: 20 }, { width: 15 },
            { width: 20 }, { width: 40 }, { width: 30 }
        ];

        // --- TITLE ---
        const titleRow = sheet.addRow(["TIME TRACKING REPORT"]);
        titleRow.font = { size: 22, bold: true, color: { argb: '1E40AF' } };
        titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 45;
        sheet.mergeCells('A1:K1');

        sheet.addRow([]);
        const dateRangeRow = sheet.addRow(["Date Range:", `${startDate} to ${endDate}`]);
        dateRangeRow.font = { bold: true, size: 12 };
        dateRangeRow.height = 30;

        sheet.addRow([]);

        // --- USER SUMMARY SECTION ---
        const summaryTitleRow = sheet.addRow(["USER SUMMARY"]);
        summaryTitleRow.font = { bold: true, size: 16, color: { argb: '065F46' } };
        summaryTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
        summaryTitleRow.alignment = { horizontal: 'center', vertical: 'middle' };
        summaryTitleRow.height = 38;
        sheet.mergeCells('A' + summaryTitleRow.number + ':I' + summaryTitleRow.number);

        sheet.addRow([]);
        const summaryHeaders = sheet.addRow([
            "Sr. No.", "User", "Email", "Department", "Total Entries", "Total Hours", "Total Minutes", "Total Time", "Avg. Hours/Day"
        ]);
        summaryHeaders.eachCell(cell => {
            cell.font = { bold: true, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        summaryHeaders.height = 32;

        const reportStartDate = new Date(startDate);
        const reportEndDate = new Date(endDate);
        const daysDiff = Math.ceil((reportEndDate - reportStartDate) / (1000 * 60 * 60 * 24)) + 1;

        let grandTotalEntries = 0;
        let grandTotalMinutes = 0;

        const sortedUsers = Object.values(userSummary).sort((a, b) => a.name.localeCompare(b.name));

        sortedUsers.forEach((u, index) => {
            const avgHoursPerDay = ((u.totalMinutes / 60) / daysDiff).toFixed(2);
            const h = Math.floor(u.totalMinutes / 60);
            const m = u.totalMinutes % 60;

            const row = sheet.addRow([
                index + 1,
                u.name,
                u.email || "N/A",
                u.dept || "N/A",
                u.entries,
                h,
                m,
                `${h}h ${m}m`,
                avgHoursPerDay
            ]);

            row.eachCell(cell => {
                cell.border = { top: { style: 'thin', color: { argb: 'E2E8F0' } }, left: { style: 'thin', color: { argb: 'E2E8F0' } }, bottom: { style: 'thin', color: { argb: 'E2E8F0' } }, right: { style: 'thin', color: { argb: 'E2E8F0' } } };
                cell.alignment = { vertical: 'middle' };
            });

            grandTotalEntries += u.entries;
            grandTotalMinutes += u.totalMinutes;
        });

        const finalGrandHours = Math.floor(grandTotalMinutes / 60);
        const finalGrandMinutes = grandTotalMinutes % 60;

        const totalRow = sheet.addRow([
            "TOTAL",
            `${sortedUsers.length} Users`,
            "", "",
            grandTotalEntries,
            finalGrandHours,
            finalGrandMinutes,
            `${finalGrandHours}h ${finalGrandMinutes}m`,
            ""
        ]);

        totalRow.eachCell(cell => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        sheet.mergeCells(`A${totalRow.number}:D${totalRow.number}`);

        sheet.addRow([]);
        sheet.addRow([]);

        // --- DETAILED ENTRIES SECTION ---
        const detailHeaderTitleRow = sheet.addRow(["DETAILED TIME ENTRIES BY USER"]);
        detailHeaderTitleRow.font = { bold: true, size: 16, color: { argb: '7C3AED' } };
        detailHeaderTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } };
        detailHeaderTitleRow.alignment = { horizontal: 'center', vertical: 'middle' };
        detailHeaderTitleRow.height = 38;
        sheet.mergeCells('A' + detailHeaderTitleRow.number + ':K' + detailHeaderTitleRow.number);

        sheet.addRow([]);
        const detailHeaders = sheet.addRow([
            "User", "Email", "Department", "Date", "Task ID", "Project",
            "Hours", "Minutes", "Location", "Remarks", "Client"
        ]);
        detailHeaders.eachCell(cell => {
            cell.font = { bold: true, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        detailHeaders.height = 32;

        // Group rows by user for detailed section
        const usersDetailedData = {};
        result.rows.forEach(row => {
            if (!usersDetailedData[row.user_name]) {
                usersDetailedData[row.user_name] = {
                    name: row.user_name,
                    email: row.user_email,
                    dept: row.user_dept,
                    entries: []
                };
            }
            usersDetailedData[row.user_name].entries.push(row);
        });

        Object.values(usersDetailedData).sort((a, b) => a.name.localeCompare(b.name)).forEach((userData, userIndex) => {
            const h = Math.floor(userData.entries.reduce((acc, curr) => acc + (curr.hours * 60) + curr.minutes, 0) / 60);
            const m = userData.entries.reduce((acc, curr) => acc + (curr.hours * 60) + curr.minutes, 0) % 60;
            
            const userSeparatorRow = sheet.addRow([
                `USER: ${userData.name.toUpperCase()}`,
                userData.email || "N/A",
                userData.dept || "N/A",
                `Entries: ${userData.entries.length}`,
                `Total: ${h}h ${m}m`,
                "", "", "", "", "", ""
            ]);

            userSeparatorRow.eachCell((cell) => {
                cell.font = { bold: true, size: 12, color: { argb: '1E40AF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: userIndex % 2 === 0 ? { argb: 'E0F2FE' } : { argb: 'DBEAFE' } };
                cell.alignment = { vertical: 'middle' };
            });
            userSeparatorRow.height = 36;
            sheet.mergeCells(`A${userSeparatorRow.number}:C${userSeparatorRow.number}`);
            sheet.mergeCells(`D${userSeparatorRow.number}:E${userSeparatorRow.number}`);

            userData.entries.forEach((entry, entryIndex) => {
                const row = sheet.addRow([
                    entry.user_name, entry.user_email || "-", entry.user_dept || "-",
                    new Date(entry.entry_date).toLocaleDateString(), entry.task_id || "-", entry.project_name || "-",
                    entry.hours, entry.minutes, entry.location || "-", entry.remarks || "-", entry.client || "-"
                ]);
                row.eachCell((cell, colNumber) => {
                    const rowColor = entryIndex % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } };
                    cell.border = { left: { style: 'thin', color: { argb: 'E2E8F0' } }, right: { style: 'thin', color: { argb: 'E2E8F0' } }, bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
                    if (colNumber === 7 || colNumber === 8) cell.alignment = { vertical: 'middle', horizontal: 'right' };
                });
            });
            sheet.addRow([]);
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
