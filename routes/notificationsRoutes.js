const express = require('express');
const router = express.Router();
const { checkWeeklyHours } = require('../controllers/notificationsController');
const { protect } = require('../middlewares/authMiddleware');

// Trigger manually or via cron. Can be protected if needed.
// For now, let's protect it so only logged in users (or admin) can trigger it, 
// or leave it public if a cron service calls it (with API key usually, but let's assume protect).
router.post('/check-weekly-hours', protect, checkWeeklyHours);

module.exports = router;
