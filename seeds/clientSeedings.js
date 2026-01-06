const ExcelJS = require("exceljs");
const path = require("path");
const pool = require("../db");
const fs = require("fs");

const FILE_PATH = path.join(__dirname, "../data/clients.xlsx");

async function seedClientsFromExcel() {
  console.log(`📂 Starting client seeding from: ${FILE_PATH}`);
  
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
    const requiredColumns = ['name'];
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
      duplicatesInFile: new Map(), // client_name -> [row numbers]
      missingData: [],
      insertedClients: new Set(),
      updatedClients: new Set()
    };

    console.log("\n📝 Processing data rows...");
    
    // Process each row
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      // Extract client name
      const client_name = row.getCell(headerMap['name'])?.value?.toString().trim();
      
      stats.rowsProcessed++;

      // Check for missing data
      if (!client_name) {
        stats.rowsSkipped++;
        stats.missingData.push({
          row: rowNumber,
          name: client_name || '(empty)'
        });
        continue;
      }

      // Track duplicates within the file
      if (!stats.duplicatesInFile.has(client_name)) {
        stats.duplicatesInFile.set(client_name, []);
      }
      stats.duplicatesInFile.get(client_name).push(rowNumber);

      // Insert or update client
      try {
        const result = await client.query(`
          INSERT INTO clients (name) 
          VALUES ($1)
          ON CONFLICT (name) 
          DO UPDATE SET 
            name = EXCLUDED.name
          RETURNING id, (xmax = 0) AS inserted
        `, [client_name]);
        
        if (result.rows.length > 0) {
          const isInsert = result.rows[0].inserted;
          if (isInsert) {
            stats.rowsInserted++;
            stats.insertedClients.add(client_name);
            console.log(`✅ Row ${rowNumber}: INSERTED client "${client_name}"`);
          } else {
            stats.rowsUpdated++;
            stats.updatedClients.add(client_name);
            console.log(`↩️ Row ${rowNumber}: UPDATED client "${client_name}"`);
          }
        }
        
      } catch (error) {
        console.error(`❌ Row ${rowNumber} failed:`, error.message);
        stats.rowsSkipped++;
      }
    }

    await client.query("COMMIT");

    // Generate summary report
    generateClientSummaryReport(stats);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Client seeding failed with error:");
    console.error("   Message:", error.message);
    if (error.detail) console.error("   Detail:", error.detail);
    if (error.hint) console.error("   Hint:", error.hint);
    throw error;
  } finally {
    client.release();
  }
}

function generateClientSummaryReport(stats) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 CLIENT SEEDING COMPLETE - SUMMARY REPORT");
  console.log("=".repeat(60));
  
  console.log("\n📈 OVERALL STATISTICS:");
  console.log(`   • Total rows in Excel: ${stats.totalRowsInSheet}`);
  console.log(`   • Rows processed: ${stats.rowsProcessed}`);
  console.log(`   • Rows inserted: ${stats.rowsInserted}`);
  console.log(`   • Rows updated: ${stats.rowsUpdated}`);
  console.log(`   • Rows skipped: ${stats.rowsSkipped}`);
  
  // Find actual duplicates (appear more than once in file)
  const actualDuplicates = Array.from(stats.duplicatesInFile.entries())
    .filter(([client_name, rows]) => rows.length > 1);
  
  if (actualDuplicates.length > 0) {
    console.log("\n⚠️ DUPLICATE CLIENT NAMES FOUND IN EXCEL FILE:");
    actualDuplicates.forEach(([client_name, rows]) => {
      console.log(`   • "${client_name}" appears on rows: ${rows.join(', ')}`);
    });
    console.log(`   Total duplicate clients: ${actualDuplicates.length}`);
  } else {
    console.log("\n✅ No duplicate client names found in Excel file");
  }
  
  if (stats.missingData.length > 0) {
    console.log("\n📝 ROWS SKIPPED DUE TO MISSING DATA:");
    stats.missingData.slice(0, 10).forEach(row => {
      console.log(`   • Row ${row.row}: client_name="${row.name}"`);
    });
    if (stats.missingData.length > 10) {
      console.log(`   ... and ${stats.missingData.length - 10} more`);
    }
  }
  
  // Show sample of inserted/updated clients
  if (stats.insertedClients.size > 0) {
    console.log(`\n✅ New clients inserted: ${stats.insertedClients.size}`);
    const sampleClients = Array.from(stats.insertedClients).slice(0, 5);
    sampleClients.forEach(client => console.log(`   • ${client}`));
    if (stats.insertedClients.size > 5) {
      console.log(`   ... and ${stats.insertedClients.size - 5} more`);
    }
  }
  
  if (stats.updatedClients.size > 0) {
    console.log(`\n↩️ Existing clients updated: ${stats.updatedClients.size}`);
    const sampleClients = Array.from(stats.updatedClients).slice(0, 5);
    sampleClients.forEach(client => console.log(`   • ${client}`));
    if (stats.updatedClients.size > 5) {
      console.log(`   ... and ${stats.updatedClients.size - 5} more`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Client seeding process completed successfully!");
  console.log("=".repeat(60));
}

// Helper function to just analyze the Excel file without inserting
async function analyzeClientsExcelFile() {
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
  const clients = new Map();
  const headerRow = worksheet.getRow(1);
  const headerMap = {};
  
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = cell.value?.toString().trim().toLowerCase();
    if (value) headerMap[value] = colNumber;
  });
  
  if (!headerMap.name) {
    console.log("\n⚠️ No 'name' column found in headers");
    return;
  }
  
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const client_name = row.getCell(headerMap.name)?.value?.toString().trim();
    if (client_name) {
      if (!clients.has(client_name)) clients.set(client_name, []);
      clients.get(client_name).push(rowNumber);
    }
  }
  
  const duplicates = Array.from(clients.entries()).filter(([_, rows]) => rows.length > 1);
  
  if (duplicates.length > 0) {
    console.log(`\n⚠️ Found ${duplicates.length} duplicate client names in Excel file:`);
    duplicates.forEach(([client_name, rows]) => {
      console.log(`   • "${client_name}" appears ${rows.length} times on rows: ${rows.join(', ')}`);
    });
  } else {
    console.log("\n✅ No duplicate client names found in Excel file");
  }
}

// Export both functions with corrected names
module.exports = { 
  seedClientsFromExcel, 
  analyzeClientsExcelFile 
};