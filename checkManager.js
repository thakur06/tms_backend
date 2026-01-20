const ExcelJS = require("exceljs");
const path = require("path");
const fs = require('fs');

async function checkHeaders() {
  const FILE_PATH = path.join(__dirname, "data/manager.xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const worksheet = workbook.worksheets[0];
  
  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers.push({ col: colNumber, label: cell.value });
  });
  
  const rows = [];
  for (let i = 2; i <= 6; i++) {
    const row = worksheet.getRow(i);
    const data = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      data.push(cell.value);
    });
    rows.push(data);
  }
  
  const output = { headers, sampleRows: rows };
  fs.writeFileSync('manager_structure.json', JSON.stringify(output, null, 2));
  console.log("Analysis saved to manager_structure.json");
}

checkHeaders().catch(console.error);
