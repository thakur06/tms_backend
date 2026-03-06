const ExcelJS = require("exceljs");
const path = require("path");
const pool = require("../db");
const fs = require("fs");

const FILE_PATH = path.join(__dirname, "../data/pipe.xlsx");

async function seedPipeSpecificationsFromExcel() {
  console.log(`🌱 Starting pipe specifications seeding from: ${FILE_PATH}`);
  
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ File not found: ${FILE_PATH}`);
    return;
  }

  const client = await pool.connect();
  
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      console.error("❌ No worksheets found in the Excel file");
      return;
    }
    
    console.log(`📊 Worksheet: "${worksheet.name}" (${worksheet.rowCount} rows)`);

    // Parse headers
    const headerRow = worksheet.getRow(1);
    const headerMap = {};
    
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = cell.value?.toString().trim().toLowerCase().replace(/\s+/g, ' ');
      if (value) {
        headerMap[value] = colNumber;
      }
    });

    // Define target headers (mapping Excel names to expected internal keys)
    const mapping = {
      'items': 'items',
      'size': 'size',
      'sizein decimal': 'size_decimal',
      'pipe / flange od': 'pipe_flange_od',
      'class': 'class',
      'value / length': 'value_length'
    };

    // Check for required columns (using common variants if needed)
    const requiredExcelHeaders = ['items', 'size', 'sizein decimal', 'pipe / flange od', 'value / length'];
    const missingHeaders = requiredExcelHeaders.filter(h => !headerMap[h]);

    if (missingHeaders.length > 0) {
      console.error(`\n❌ Missing required columns: ${missingHeaders.join(', ')}`);
      console.log("   Available columns:", Object.keys(headerMap));
      return;
    }

    await client.query("BEGIN");

    let inserted = 0;
    let skipped = 0;

    for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        
        const items = row.getCell(headerMap['items'])?.value?.toString().trim();
        const size_label = row.getCell(headerMap['size'])?.value?.toString().trim();
        const size_decimal = parseFloat(row.getCell(headerMap['sizein decimal'])?.value);
        const pipe_flange_od = parseFloat(row.getCell(headerMap['pipe / flange od'])?.value);
        const class_label = row.getCell(headerMap['class'])?.value?.toString().trim() || 'NA';
        const value_length = parseFloat(row.getCell(headerMap['value / length'])?.value);

        if (!items || !size_label || isNaN(size_decimal)) {
            skipped++;
            continue;
        }

        await client.query(
            `INSERT INTO pipe_specifications (items, size_label, size_decimal, pipe_flange_od, class_label, value_length)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [items, size_label, size_decimal, pipe_flange_od, class_label, value_length]
        );
        inserted++;
    }

    await client.query("COMMIT");
    console.log(`✅ Seeding complete. Inserted: ${inserted}, Skipped: ${skipped}`);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Pipe specifications seeding failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { 
  seedPipeSpecificationsFromExcel
};
