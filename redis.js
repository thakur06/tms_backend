const Redis = require("ioredis");
require("dotenv").config();

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false, // Fail commands immediately if not connected
  connectTimeout: 10000,
  retryStrategy: (times) => {
    // Retry connection but don't crash
    if (times > 5) return null; // Stop retrying after 5 attempts if you want to be strict, or allow indefinite
    return Math.min(times * 200, 2000);
  }
});

redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => {
  // Silent error to prevent crash in dev
  if (process.env.NODE_ENV !== 'production') {
    // console.log("ℹ️ Redis not available, caching disabled.");
  } else {
    console.error("❌ Redis error:", err.message);
  }
});

// Utility for easy caching
const cache = async (key, fetcher, ttl = 3600) => {
  // If redis is not ready, just fetch fresh data
  if (redis.status !== "ready") {
    return await fetcher();
  }

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const fresh = await fetcher();
    await redis.set(key, JSON.stringify(fresh), "EX", ttl);
    return fresh;
  } catch (err) {
    console.error("Redis Cache Error:", err);
    return await fetcher();
  }
};

module.exports = { redis, cache };

