const express = require('express');
const router = express.Router();
const {
  getTimeEntriesReport,
  getCurrentWeekTotalTime,
  exportTimeEntriesExcel
} = require('../controllers/reportController');

const { protect } = require('../middlewares/authMiddleware');

router.get('/time-entries', protect, getTimeEntriesReport);
router.get('/export', protect, exportTimeEntriesExcel);
router.get('/total-time/current-week', protect, getCurrentWeekTotalTime);

module.exports = router;
