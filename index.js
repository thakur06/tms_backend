require("dotenv").config();
const cluster = require("cluster");
const os = require("os");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { redis } = require("./redis");
const { RedisStore } = require("rate-limit-redis");

const { ensureDeptTable } = require("./validators/deptSchema");
const { ensureTasksTable } = require("./validators/tasksSchema");
const { ensureUsersTable } = require("./validators/userSchema");
const { ensureProjectsTable } = require("./validators/projectsSchema");
const { ensureTimeEntriesTable } = require("./validators/timeEntriesSchema");
const { ensureClientsTable } = require("./validators/clientSchema");
const { ensurePasswordResetOtpTable } = require("./validators/passwordResetOtpSchema");
const { ensureUserProjectsTable } = require("./validators/userProjectsSchema");
const { ensureTimesheetApprovalsTable } = require("./validators/timesheetApprovalsSchema");
const { ensureDepartmentsTable } = require("./validators/departmentSchema");
const { ensureTicketsTable } = require("./validators/ticketsSchema");
const { ensureTicketCommentsTable } = require("./validators/ticketCommentsSchema");

// Import routes
const authRoutes = require("./routes/authRoutes");
const timeEntriesRoutes = require("./routes/timeEntriesRoutes");
const userRoutes = require("./routes/userRoutes");
const projectRoutes = require("./routes/projectRoutes");
const taskRoutes = require("./routes/taskRoutes");
const deptRoutes = require("./routes/deptRoutes");
const clientRoutes = require("./routes/clientRoutes");
const reportRoutes = require("./routes/reportRoutes");
const seedRoutes = require("./routes/seedRoutes");
const notificationRoutes = require("./routes/notificationsRoutes");
const timesheetApprovalRoutes = require("./routes/timesheetApprovalRoutes");
const userProjectRoutes = require("./routes/userProjectRoutes");
const ticketRoutes = require("./routes/ticketRoutes");

const numCPUs = os.cpus().length;
const app = express();

// --- Security & Performance Middleware ---
app.use(helmet()); // Secure headers
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit body size
app.use(compression()); // Gzip compression

// Global Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: (redis.status === "ready")
    ? new RedisStore({
        sendCommand: (...args) => redis.call(...args),
      })
    : undefined, // Fallback to MemoryStore
});
app.use("/api/", limiter);

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/time-entries", timeEntriesRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/dept", deptRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/reports", reportRoutes);
app.use("/", seedRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/timesheets", timesheetApprovalRoutes);
app.use("/api/user-projects", userProjectRoutes);
app.use("/api/tickets", ticketRoutes);

const { getCurrentWeekTotalTime } = require("./controllers/reportController");
const { protect } = require("./middlewares/authMiddleware");

app.get("/total-time/current-week", protect, getCurrentWeekTotalTime);
app.get("/health", (req, res) => res.json({ status: "ok", worker: process.pid }));

if (cluster.isPrimary && process.env.NODE_ENV === "production") {
  console.log(`🚀 Primary process ${process.pid} is running`);

  Promise.all([
    ensureProjectsTable(),
    ensureTimeEntriesTable(),
    ensureUsersTable(),
    ensureTasksTable(),
    ensureDeptTable(),
    ensureClientsTable(),
    ensurePasswordResetOtpTable(),
    ensureUserProjectsTable(),
    ensureTimesheetApprovalsTable(),
    ensureDepartmentsTable(),
    ensureTicketsTable(),
    ensureTicketCommentsTable(),
  ]).then(() => {
    console.log("✅ Database schema verified");
    for (let i = 0; i < numCPUs; i++) cluster.fork();
  });

  cluster.on("exit", (worker) => {
    console.log(`⚠️ Worker ${worker.process.pid} died. Forking a new one...`);
    cluster.fork();
  });
} else {
  const PORT = process.env.PORT || 4000;
  const initScheduler = require("./scheduler");

  // Run validators/schema checks in dev mode or in workers (if needed, though workers usually don't need to re-verify)
  // Actually, in clustered mode, primary does it. 
  // In non-clustered mode (dev), we MUST do it here.
  const runValidators = async () => {
     // If we are in dev (no cluster primary check passed), run them.
     // Or if we are a worker, we generally assume primary did it, but safe to skip.
     // However, simpler logic: If not production primary, just ensure it runs once if possible.
     // But for "npm start" (dev), cluster.isPrimary is true, but env != production.
     // So it lands here. We MUST run validators here.
     
     if (cluster.isPrimary) {
        await Promise.all([
          ensureProjectsTable(),
          ensureTimeEntriesTable(),
          ensureUsersTable(),
          ensureTasksTable(),
          ensureDeptTable(),
          ensureClientsTable(),
          ensurePasswordResetOtpTable(),
          ensureUserProjectsTable(),
          ensureTimesheetApprovalsTable(),
          ensureDepartmentsTable(),
          ensureTicketsTable(),
          ensureTicketCommentsTable(),
        ]);
        console.log("✅ Database schema verified (Dev/Single Mode)");
     }
  };

  runValidators().then(() => {
    if (cluster.isPrimary || !cluster.isWorker || (cluster.isWorker && cluster.worker.id === 1)) {
       initScheduler();
    }
  
    app.listen(PORT, () => {
      console.log(`✅ Server/Worker ${process.pid} started on http://localhost:${PORT}`);
    });
  });
}

module.exports = app;


