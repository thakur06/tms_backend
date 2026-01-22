const ExcelJS = require("exceljs");
const path = require("path");
const pool = require("../db");
const fs = require("fs");

const FILE_PATH = path.join(__dirname, "../data/projects.xlsx");

async function seedProjectsFromExcel() {
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
    const requiredColumns = ['name', 'location'];
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
      duplicatesInFile: new Map(), // code -> [row numbers]
      missingData: [],
      insertedCodes: new Set(),
      updatedCodes: new Set()
    };

    console.log("\n📝 Processing data rows...");
    
    // Process each row
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      // Extract values
      const name = row.getCell(headerMap['name'])?.value?.toString().trim();
      const location = row.getCell(headerMap['location'])?.value?.toString().trim();
      const clientName = headerMap['client'] ? row.getCell(headerMap['client'])?.value?.toString().trim() : 'Unknown';
      const category = headerMap['category'] ? row.getCell(headerMap['category'])?.value?.toString().trim() : 'project';

      
      stats.rowsProcessed++;

      // Check for missing data
      if (!name || !location) {
        stats.rowsSkipped++;
        stats.missingData.push({
          row: rowNumber,
          name: name || '(empty)',
          location: location || '(empty)'
        });
        continue;
      }

      // Insert or update row
      try {
        // Check if project exists by name (since code is serial/auto-generated or not provided)
        // We will assume name is unique for now or use name for conflict resolution if code is not provided
        // However, the original code used 'code' for conflict.
        // User asked to "remove code since it is serialized"
        // So we should match on NAME maybe? Or just INSERT and let DB handle unique name?
        // The projectsSchema says: name TEXT UNIQUE NOT NULL
        // So we should use ON CONFLICT (name)
        
        const result = await client.query(`
          INSERT INTO projects (name, location, client, category) 
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (name) 
          DO UPDATE SET 
            location = EXCLUDED.location,
            client = EXCLUDED.client,
            category = EXCLUDED.category
          RETURNING id, (xmax = 0) AS inserted
        `, [name, location, clientName, category]);
        
        if (result.rows.length > 0) {
          const isInsert = result.rows[0].inserted;
          if (isInsert) {
            stats.rowsInserted++;
            // stats.insertedCodes.add(code); // Code not available
            console.log(`✅ Row ${rowNumber}: INSERTED "${name}"`);
          } else {
            stats.rowsUpdated++;
            // stats.updatedCodes.add(code); // Code not available
            console.log(`↩️ Row ${rowNumber}: UPDATED "${name}"`);
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
  console.log("📊 SEEDING COMPLETE - SUMMARY REPORT");
  console.log("=".repeat(60));
  
  console.log("\n📈 OVERALL STATISTICS:");
  console.log(`   • Total rows in Excel: ${stats.totalRowsInSheet}`);
  console.log(`   • Rows processed: ${stats.rowsProcessed}`);
  console.log(`   • Rows inserted: ${stats.rowsInserted}`);
  console.log(`   • Rows updated: ${stats.rowsUpdated}`);
  console.log(`   • Rows skipped: ${stats.rowsSkipped}`);
  
  // Find actual duplicates (appear more than once in file)
  const actualDuplicates = Array.from(stats.duplicatesInFile.entries())
    .filter(([code, rows]) => rows.length > 1);
  
  if (actualDuplicates.length > 0) {
    console.log("\n⚠️ DUPLICATE CODES FOUND IN EXCEL FILE:");
    actualDuplicates.forEach(([code, rows]) => {
      console.log(`   • "${code}" appears on rows: ${rows.join(', ')}`);
    });
    console.log(`   Total duplicate codes: ${actualDuplicates.length}`);
  } else {
    console.log("\n✅ No duplicate codes found in Excel file");
  }
  
  if (stats.missingData.length > 0) {
    console.log("\n📝 ROWS SKIPPED DUE TO MISSING DATA:");
    stats.missingData.slice(0, 10).forEach(row => {
      console.log(`   • Row ${row.row}: name="${row.name}", code="${row.code}", location="${row.location}"`);
    });
    if (stats.missingData.length > 10) {
      console.log(`   ... and ${stats.missingData.length - 10} more`);
    }
  }
  
  // Show sample of inserted/updated codes
  if (stats.insertedCodes.size > 0) {
    console.log(`\n✅ New projects inserted: ${stats.insertedCodes.size}`);
    const sampleCodes = Array.from(stats.insertedCodes).slice(0, 5);
    sampleCodes.forEach(code => console.log(`   • ${code}`));
    if (stats.insertedCodes.size > 5) {
      console.log(`   ... and ${stats.insertedCodes.size - 5} more`);
    }
  }
  
  if (stats.updatedCodes.size > 0) {
    console.log(`\n↩️ Existing projects updated: ${stats.updatedCodes.size}`);
    const sampleCodes = Array.from(stats.updatedCodes).slice(0, 5);
    sampleCodes.forEach(code => console.log(`   • ${code}`));
    if (stats.updatedCodes.size > 5) {
      console.log(`   ... and ${stats.updatedCodes.size - 5} more`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Seeding process completed successfully!");
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
  const codes = new Map();
  const headerRow = worksheet.getRow(1);
  const headerMap = {};
  
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = cell.value?.toString().trim().toLowerCase();
    if (value) headerMap[value] = colNumber;
  });
  
  if (!headerMap.code) {
    console.log("\n⚠️ No 'code' column found in headers");
    return;
  }
  
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const code = row.getCell(headerMap.code)?.value?.toString().trim();
    if (code) {
      if (!codes.has(code)) codes.set(code, []);
      codes.get(code).push(rowNumber);
    }
  }
  
  const duplicates = Array.from(codes.entries()).filter(([_, rows]) => rows.length > 1);
  
  if (duplicates.length > 0) {
    console.log(`\n⚠️ Found ${duplicates.length} duplicate codes in Excel file:`);
    duplicates.forEach(([code, rows]) => {
      console.log(`   • "${code}" appears ${rows.length} times on rows: ${rows.join(', ')}`);
    });
  } else {
    console.log("\n✅ No duplicate codes found in Excel file");
  }
}

// Export both functions
module.exports = { 
  seedProjectsFromExcel, 
  analyzeExcelFile 
};