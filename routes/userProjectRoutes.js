const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getAllAssignments,
  getUserAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment
} = require('../controllers/userProjectController');

// All routes require authentication
router.use(protect);

// Get all assignments (grouped by user)
router.get('/', getAllAssignments);

// Get assignments for specific user
router.get('/user/:userId', getUserAssignments);

// Create new assignment
router.post('/', createAssignment);

// Update assignment
router.put('/:id', updateAssignment);

// Delete assignment
router.delete('/:id', deleteAssignment);

module.exports = router;
