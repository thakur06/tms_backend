require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { ensureDeptTable } = require("./validators/deptSchema");
const { ensureTasksTable } = require("./validators/tasksSchema");
const { ensureUsersTable } = require("./validators/userSchema");
const { ensureProjectsTable } = require("./validators/projectsSchema");
const { ensureTimeEntriesTable } = require("./validators/timeEntriesSchema");
const { ensureClientsTable } = require("./validators/clientSchema");
const {
  ensurePasswordResetOtpTable,
} = require("./validators/passwordResetOtpSchema");

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

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(compression());

// Routes
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

// Backward compatibility route
const { getCurrentWeekTotalTime } = require("./controllers/reportController");
app.get("/total-time/current-week", getCurrentWeekTotalTime);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Initialize database tables and start server
Promise.all([
  ensureProjectsTable(),
  ensureTimeEntriesTable(),
  ensureUsersTable(),
  ensureTasksTable(),
  ensureDeptTable(),
  ensureClientsTable(),
  ensurePasswordResetOtpTable(),
]).then(() => {
  app.listen(PORT, () => {
    console.log(`✅ API running on http://localhost:${PORT}`);
  });
});

module.exports = app;
