const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  createTimeEntry,
  getTimeEntries,
  getTimeEntriesByUser,
  deleteTimeEntry,
  updateTimeEntry,
  bulkTimeEntry
} = require('../controllers/timeEntriesController');

// All time entry routes require authentication
router.post('/', protect, createTimeEntry);
router.post('/bulk', protect, bulkTimeEntry);
router.get('/', protect, getTimeEntries);
router.get('/user/me', protect, getTimeEntriesByUser); // Changed to /user/me to get current user's entries
router.delete('/:id', protect, deleteTimeEntry);
router.put('/:id', protect, updateTimeEntry);

module.exports = router;
