const ExcelJS = require("exceljs");
const path = require("path");
const pool = require("../db");
const fs = require("fs");

const FILE_PATH = path.join(__dirname, "../data/manager.xlsx");

async function seedManagersFromExcel() {
  console.log(`📂 Starting manager seeding from: ${FILE_PATH}`);
  
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ File not found: ${FILE_PATH}`);
    return;
  }

  const client = await pool.connect();
  
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const worksheet = workbook.worksheets[0];

    const stats = {
      totalRows: worksheet.rowCount - 1,
      updated: 0,
      managerNotFound: 0,
      employeeNotFound: 0,
      errors: 0
    };

    // Mapping headers (using indices from analysis)
    // 3: Full name
    // 4: Reports To
    // 7: Email
    
    console.log("📝 Processing rows...");

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      
      const employeeName = row.getCell(3).value?.toString().trim();
      const managerNameRaw = row.getCell(4).value?.toString().trim();
      let employeeEmail = row.getCell(7).value;
      
      // Handle ExcelJS email object/hyperlink
      if (employeeEmail && typeof employeeEmail === 'object') {
        employeeEmail = employeeEmail.text || employeeEmail.result;
      }
      employeeEmail = employeeEmail?.toString().trim().toLowerCase();

      if (!employeeEmail || !managerNameRaw) continue;

      // Clean manager name (take first if multiple)
      const managerName = managerNameRaw.split('/')[0].trim();

      try {
        // 1. Find employee
        const empRes = await client.query("SELECT id FROM users WHERE email = $1", [employeeEmail]);
        if (empRes.rows.length === 0) {
          stats.employeeNotFound++;
          continue;
        }
        const employeeId = empRes.rows[0].id;

        // 2. Find manager
        // Use ILIKE for fuzzy matching because of names like "Aditiya" vs "Aditya"
        const mgrRes = await client.query(
          "SELECT id FROM users WHERE name ILIKE $1", 
          [`%${managerName}%`]
        );

        if (mgrRes.rows.length === 0) {
          stats.managerNotFound++;
          console.log(`⚠️ Manager not found in DB: "${managerName}" (for employee: ${employeeEmail})`);
          continue;
        }
        
        const managerId = mgrRes.rows[0].id;

        // 3. Update employee
        await client.query(
          "UPDATE users SET reporting_manager_id = $1 WHERE id = $2",
          [managerId, employeeId]
        );

        // 4. Mark as manager
        await client.query(
          "UPDATE users SET is_manager = true WHERE id = $1",
          [managerId]
        );

        stats.updated++;
      } catch (err) {
        console.error(`❌ Error at row ${i}:`, err.message);
        stats.errors++;
      }
    }

    console.log("\n📊 Manager Seeding Stats:");
    console.log(`- Total Rows: ${stats.totalRows}`);
    console.log(`- Successfully Updated: ${stats.updated}`);
    console.log(`- Employee Not Found: ${stats.employeeNotFound}`);
    console.log(`- Manager Not Found: ${stats.managerNotFound}`);
    console.log(`- Errors: ${stats.errors}`);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    client.release();
  }
}

module.exports = { seedManagersFromExcel };
