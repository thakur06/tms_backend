const ExcelJS = require('exceljs');
const path = require('path');

const departments = [
  { dept_id: 1, dept_name: "Controls" },
  { dept_id: 2, dept_name: "Mechanical" },
  { dept_id: 3, dept_name: "Process" },
  { dept_id: 4, dept_name: "Electrical" },
  { dept_id: 5, dept_name: "Project Controls" },
  { dept_id: 6, dept_name: "Document Controls" },
  { dept_id: 7, dept_name: "Business Development" },
  { dept_id: 8, dept_name: "Product Development" },
  { dept_id: 9, dept_name: "IT & OMAI" },
  { dept_id: 10, dept_name: "Procurement" },
  { dept_id: 11, dept_name: "Operations" },
  { dept_id: 12, dept_name: "Others" }
];

const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Departments');

    worksheet.columns = [
        { header: 'dept_id', key: 'dept_id', width: 10 },
        { header: 'dept_name', key: 'dept_name', width: 30 }
    ];

    worksheet.addRows(departments);

    // Styling
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    const filePath = path.join(__dirname, '..', 'departments.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Excel file generated at: ${filePath}`);
};

generateExcel().catch(console.error);
