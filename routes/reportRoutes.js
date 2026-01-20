const express = require('express');
const router = express.Router();
const {
  getTimeEntriesReport,
  getCurrentWeekTotalTime
} = require('../controllers/reportController');

const { protect } = require('../middlewares/authMiddleware');

router.get('/time-entries', protect, getTimeEntriesReport);
router.get('/total-time/current-week', protect, getCurrentWeekTotalTime);

module.exports = router;
