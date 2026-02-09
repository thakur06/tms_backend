module.exports = {
  apps: [
    {
      name: "tms-server",
      script: "./index.js",
      instances: "max", // Utilizes all available CPU cores
      exec_mode: "cluster", // Enables Node.js clustering
      env: {
        NODE_ENV: "production",
        PORT: 4000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 4000
      },
      // Resilience settings
      exp_backoff_restart_delay: 100,
      max_memory_restart: "1G", // Restart if memory leaks occur
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      time: true
    }
  ]
};
