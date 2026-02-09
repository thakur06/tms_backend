const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "TMS",
  password: process.env.PGPASSWORD || "admin123",
  port: Number(process.env.PGPORT) || 5433,
});

async function checkConnections() {
  try {
    const client = await pool.connect();
    
    // Check Max Configured Connections
    const resMax = await client.query("SHOW max_connections;");
    const maxConn = parseInt(resMax.rows[0].max_connections);

    // Check Current Active Connections
    const resCurr = await client.query("SELECT count(*) FROM pg_stat_activity;");
    const currConn = parseInt(resCurr.rows[0].count);

    console.log(`\n📊 DATABASE CONNECTION STATUS`);
    console.log(`===========================`);
    console.log(`Available CPU Cores:   ${require('os').cpus().length}`);
    console.log(`Postgres Limit (Max):  ${maxConn}`);
    console.log(`Currently Active:      ${currConn}`);
    console.log(`---------------------------`);
    
    // Config Calculation
    const poolConfigMax = 100; // From db.js
    const numCores = require('os').cpus().length;
    const potentialTotal = poolConfigMax * numCores;

    console.log(`App Config (per core): ${poolConfigMax}`);
    console.log(`Potential Total Usage: ${potentialTotal} connections (if all cores are busy)`);
    
    if (potentialTotal > maxConn) {
        console.log(`\n⚠️  WARNING: POTENTIAL OVERLOAD DETECTED`);
        console.log(`   Your clustered app can open ${potentialTotal} connections, but DB only allows ${maxConn}.`);
        console.log(`   -> You NEED a connection pooler (PgBouncer) or reduced pool size.`);
    } else {
        console.log(`\n✅ CONFIG LOOKS SAFE (for now)`);
    }

    client.release();
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to query database:", err);
    process.exit(1);
  }
}

checkConnections();
