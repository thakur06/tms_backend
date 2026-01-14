const pool = require("../db");

// Create a department
exports.createDept = async (req, res) => {
  try {
    const { dept_name } = req.body;
    const result = await pool.query(
       `
      INSERT INTO departments (dept_name)
      VALUES ($1)
      RETURNING *
      `,
      [dept_name]
     
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Fail to add dept" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add department" });
  }
};

// Get all departments
exports.getDepts = async (req, res) => {
  try {
    
    const result = await pool.query(
      `
      Select * from departments
      `
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "No dept found" });
    }

    res.status(201).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch departments " });
  }
};
