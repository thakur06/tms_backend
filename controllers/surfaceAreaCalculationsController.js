const pool = require("../db");
// Triggers a forced restart of the server to ensure fresh controller logic is loaded

const saveCalculation = async (req, res) => {
  const { id, name, data, total_area } = req.body;
  const safeName = (name || "Untitled").trim();
  const safeArea = parseFloat(total_area) || 0;

  console.log(`[SAVE] Attempting save - ID: ${id}, Name: "${safeName}", Items: ${Array.isArray(data) ? data.length : 'N/A'}`);

  try {
    let result;
    if (id && !isNaN(id) && parseInt(id) > 0) {
      // UPDATE
      console.log(`[SAVE] Executing UPDATE for ID: ${id}`);
      result = await pool.query(
        `UPDATE surface_area_calculations 
         SET name = $1, data = $2, total_area = $3, updated_at = NOW() 
         WHERE id = $4 RETURNING *`,
        [safeName, JSON.stringify(data), safeArea, parseInt(id)]
      );
      if (result.rows.length === 0) {
        console.warn(`[SAVE] No record found for ID: ${id}, falling back to INSERT`);
        result = await pool.query(
          `INSERT INTO surface_area_calculations (name, data, total_area) VALUES ($1, $2, $3) RETURNING *`,
          [safeName, JSON.stringify(data), safeArea]
        );
      }
    } else {
      // INSERT
      console.log(`[SAVE] Executing INSERT`);
      result = await pool.query(
        `INSERT INTO surface_area_calculations (name, data, total_area) 
         VALUES ($1, $2, $3) RETURNING *`,
        [safeName, JSON.stringify(data), safeArea]
      );
    }

    console.log(`[SAVE] Success! ID: ${result.rows[0].id}`);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ [SAVE] Database Error:", err.message);
    if (err.detail) console.error("Detail:", err.detail);
    if (err.where) console.error("Where:", err.where);
    res.status(500).json({ 
      error: "Failed to persist calculation", 
      message: err.message,
      detail: err.detail 
    });
  }
};

const getCalculations = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, total_area, created_at, updated_at FROM surface_area_calculations ORDER BY updated_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch calculations" });
  }
};

const getCalculationById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM surface_area_calculations WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch calculation" });
  }
};

const deleteCalculation = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM surface_area_calculations WHERE id = $1", [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete" });
  }
};

module.exports = {
  saveCalculation,
  getCalculations,
  getCalculationById,
  deleteCalculation
};
