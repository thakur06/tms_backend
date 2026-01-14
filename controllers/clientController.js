const pool = require("../db");

// Create a client
exports.createClient = async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
       `
      INSERT INTO clients (name)
      VALUES ($1)
      RETURNING *
      `,
      [name]
     
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Fail to add client" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add client" });
  }
};

// Get all clients
exports.getClients = async (req, res) => {
  try {
    
    const result = await pool.query(
      `
      Select * from clients
      `
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "No client found" });
    }

    res.status(201).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client " });
  }
};
