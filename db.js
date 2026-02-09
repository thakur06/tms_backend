const { Pool } = require("pg");
require("dotenv").config();

const os = require("os");

// Smart Pool Sizing for Clustering
// Total Max DB Connections = 100 (standard limit)
// We split this across workers.
const totalMax = 100;
const cpuCount = os.cpus().length;
const poolSizePerWorker = Math.max(5, Math.floor(totalMax / cpuCount));

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "TMS",
  password: process.env.PGPASSWORD || "admin123",
  port: Number(process.env.PGPORT) || 5433,
  max: poolSizePerWorker, // Dynamic: ~12conns * 8cores = 96 total
  idleTimeoutMillis: 10000, 
  connectionTimeoutMillis: 5000, 
  allowExitOnIdle: true
});


// Test connection
pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ Connection error :", err));

module.exports = pool;
