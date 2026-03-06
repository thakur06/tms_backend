const pool = require("../db");

const getPipeSpecifications = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pipe_specifications ORDER BY size_decimal ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching pipe specifications:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createPipeSpecification = async (req, res) => {
  const { items, size_label, size_decimal, pipe_flange_od, class_label, value_length } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO pipe_specifications (items, size_label, size_decimal, pipe_flange_od, class_label, value_length) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [items, size_label, size_decimal, pipe_flange_od, class_label, value_length]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating pipe specification:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getPipeSpecifications,
  createPipeSpecification,
};
