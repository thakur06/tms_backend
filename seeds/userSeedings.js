const ExcelJS = require("exceljs");
const path = require("path");
const pool = require("../db");
const fs = require("fs");

const FILE_PATH = path.join(__dirname, "../data/user.xlsx");

async function seedUsersFromExcel() {
  console.log(`📂 Starting seeding from: ${FILE_PATH}`);
  
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ File not found: ${FILE_PATH}`);
    console.log("📁 Current directory:", __dirname);
    console.log("🔍 Looking for file at:", path.resolve(FILE_PATH));
    return;
  }

  console.log(`✅ File found: ${path.basename(FILE_PATH)} (${fs.statSync(FILE_PATH).size} bytes)`);

  const client = await pool.connect();
  
  try {
    // Load Excel file
    console.log("\n📖 Loading Excel file...");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      console.error("❌ No worksheets found in the Excel file");
      return;
    }
    
    console.log(`📊 Worksheet: "${worksheet.name}"`);
    console.log(`📈 Total rows in sheet: ${worksheet.rowCount}`);

    // Parse headers
    const headerRow = worksheet.getRow(1);
    const headerMap = {};
    const foundHeaders = [];
    
    console.log("\n🔍 Analyzing header row...");
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = cell.value?.toString().trim().toLowerCase();
      if (value) {
        headerMap[value] = colNumber;
        foundHeaders.push({ header: value, column: colNumber });
      }
    });
    
    // Log found headers
    console.log("📋 Headers found:");
    foundHeaders.forEach(h => console.log(`   ${h.column}: "${h.header}"`));
    
    // Check for required columns
    const requiredColumns = ['name', 'email', 'dept'];
    const missingColumns = requiredColumns.filter(col => !headerMap[col]);
    
    if (missingColumns.length > 0) {
      console.error(`\n❌ Missing required columns: ${missingColumns.join(', ')}`);
      console.log("   Available columns:", Object.keys(headerMap));
      return;
    }
    
    console.log("✅ All required columns found");

    // Start transaction
    await client.query("BEGIN");

    // Track statistics
    const stats = {
      totalRowsInSheet: worksheet.rowCount - 1,
      rowsProcessed: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      duplicatesInFile: new Map(), // email -> [row numbers]
      missingData: [],
      insertedEmails: new Set(),
      updatedEmails: new Set()
    };

    console.log("\n📝 Processing data rows...");
    
    // Process each row
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      // Extract values - FIXED VARIABLE NAMES
      const name = row.getCell(headerMap['name'])?.value?.toString().trim();
      const email = row.getCell(headerMap['email'])?.value?.toString().trim(); // Fixed: was 'code'
      const dept = row.getCell(headerMap['dept'])?.value?.toString().trim(); // Fixed: was 'location'
      
      stats.rowsProcessed++;

      // Check for missing data
      if (!name || !email || !dept) {
        stats.rowsSkipped++;
        stats.missingData.push({
          row: rowNumber,
          name: name || '(empty)',
          email: email || '(empty)',
          dept: dept || '(empty)'
        });
        continue;
      }

      // Track duplicates within the file
      if (!stats.duplicatesInFile.has(email)) {
        stats.duplicatesInFile.set(email, []);
      }
      stats.duplicatesInFile.get(email).push(rowNumber);

      // Insert or update row
      try {
        const result = await client.query(`
          INSERT INTO users (name, email, dept) 
          VALUES ($1, $2, $3)
          ON CONFLICT (email) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            dept = EXCLUDED.dept
          RETURNING id, (xmax = 0) AS inserted
        `, [name, email, dept]);
        
        if (result.rows.length > 0) {
          const isInsert = result.rows[0].inserted;
          if (isInsert) {
            stats.rowsInserted++;
            stats.insertedEmails.add(email);
            console.log(`✅ Row ${rowNumber}: INSERTED "${email}" - "${name}"`);
          } else {
            stats.rowsUpdated++;
            stats.updatedEmails.add(email);
            console.log(`↩️ Row ${rowNumber}: UPDATED "${email}" - "${name}"`);
          }
        }
        
      } catch (error) {
        console.error(`❌ Row ${rowNumber} failed:`, error.message);
        stats.rowsSkipped++;
      }
    }

    await client.query("COMMIT");

    // Generate summary report
    generateSummaryReport(stats);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Seeding failed with error:");
    console.error("   Message:", error.message);
    if (error.detail) console.error("   Detail:", error.detail);
    if (error.hint) console.error("   Hint:", error.hint);
    throw error;
  } finally {
    client.release();
  }
}

function generateSummaryReport(stats) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 USER SEEDING COMPLETE - SUMMARY REPORT");
  console.log("=".repeat(60));
  
  console.log("\n📈 OVERALL STATISTICS:");
  console.log(`   • Total rows in Excel: ${stats.totalRowsInSheet}`);
  console.log(`   • Rows processed: ${stats.rowsProcessed}`);
  console.log(`   • Rows inserted: ${stats.rowsInserted}`);
  console.log(`   • Rows updated: ${stats.rowsUpdated}`);
  console.log(`   • Rows skipped: ${stats.rowsSkipped}`);
  
  // Find actual duplicates (appear more than once in file)
  const actualDuplicates = Array.from(stats.duplicatesInFile.entries())
    .filter(([email, rows]) => rows.length > 1);
  
  if (actualDuplicates.length > 0) {
    console.log("\n⚠️ DUPLICATE EMAILS FOUND IN EXCEL FILE:");
    actualDuplicates.forEach(([email, rows]) => {
      console.log(`   • "${email}" appears on rows: ${rows.join(', ')}`);
    });
    console.log(`   Total duplicate emails: ${actualDuplicates.length}`);
  } else {
    console.log("\n✅ No duplicate emails found in Excel file");
  }
  
  if (stats.missingData.length > 0) {
    console.log("\n📝 ROWS SKIPPED DUE TO MISSING DATA:");
    stats.missingData.slice(0, 10).forEach(row => {
      console.log(`   • Row ${row.row}: name="${row.name}", email="${row.email}", dept="${row.dept}"`);
    });
    if (stats.missingData.length > 10) {
      console.log(`   ... and ${stats.missingData.length - 10} more`);
    }
  }
  
  // Show sample of inserted/updated emails
  if (stats.insertedEmails.size > 0) {
    console.log(`\n✅ New users inserted: ${stats.insertedEmails.size}`);
    const sampleEmails = Array.from(stats.insertedEmails).slice(0, 5);
    sampleEmails.forEach(email => console.log(`   • ${email}`));
    if (stats.insertedEmails.size > 5) {
      console.log(`   ... and ${stats.insertedEmails.size - 5} more`);
    }
  }
  
  if (stats.updatedEmails.size > 0) {
    console.log(`\n↩️ Existing users updated: ${stats.updatedEmails.size}`);
    const sampleEmails = Array.from(stats.updatedEmails).slice(0, 5);
    sampleEmails.forEach(email => console.log(`   • ${email}`));
    if (stats.updatedEmails.size > 5) {
      console.log(`   ... and ${stats.updatedEmails.size - 5} more`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 User seeding process completed successfully!");
  console.log("=".repeat(60));
}

// Helper function to just analyze the Excel file without inserting
async function analyzeExcelFile() {
  console.log("🔍 Analyzing Excel file structure...");
  
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ File not found: ${FILE_PATH}`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  
  const worksheet = workbook.worksheets[0];
  console.log(`\n📊 Worksheet: "${worksheet.name}"`);
  console.log(`📈 Total rows: ${worksheet.rowCount}`);
  console.log(`📋 Total columns: ${worksheet.columnCount}`);
  
  // Show first 5 rows with data
  console.log("\n📝 First 5 rows of data:");
  for (let rowNumber = 1; rowNumber <= Math.min(6, worksheet.rowCount); rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const rowData = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      rowData.push(cell.value || '(empty)');
    });
    console.log(`Row ${rowNumber}:`, rowData);
  }
  
  // Check for duplicates in the file
  const emails = new Map();
  const headerRow = worksheet.getRow(1);
  const headerMap = {};
  
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = cell.value?.toString().trim().toLowerCase();
    if (value) headerMap[value] = colNumber;
  });
  
  if (!headerMap.email) {
    console.log("\n⚠️ No 'email' column found in headers");
    return;
  }
  
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const email = row.getCell(headerMap.email)?.value?.toString().trim();
    if (email) {
      if (!emails.has(email)) emails.set(email, []);
      emails.get(email).push(rowNumber);
    }
  }
  
  const duplicates = Array.from(emails.entries()).filter(([_, rows]) => rows.length > 1);
  
  if (duplicates.length > 0) {
    console.log(`\n⚠️ Found ${duplicates.length} duplicate emails in Excel file:`);
    duplicates.forEach(([email, rows]) => {
      console.log(`   • "${email}" appears ${rows.length} times on rows: ${rows.join(', ')}`);
    });
  } else {
    console.log("\n✅ No duplicate emails found in Excel file");
  }
}

// Export both functions
module.exports = { 
  seedUsersFromExcel, 
  analyzeExcelFile 
};