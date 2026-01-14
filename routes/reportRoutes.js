const express = require('express');
const router = express.Router();
const {
  getTimeEntriesReport,
  getCurrentWeekTotalTime
} = require('../controllers/reportController');

router.get('/time-entries', getTimeEntriesReport);
router.get('/total-time/current-week', getCurrentWeekTotalTime);

module.exports = router;
