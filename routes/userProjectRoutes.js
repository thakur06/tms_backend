const express = require('express');
const router = express.Router();
const { protect, isAdminOrManager } = require('../middlewares/authMiddleware');
const {
  getAllAssignments,
  getUserAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  savePtoAssignments
} = require('../controllers/userProjectController');

// All routes require authentication and Admin/Manager privileges
router.use(protect);
router.use(isAdminOrManager);

// Get all assignments (grouped by user)
router.get('/', getAllAssignments);

// Get assignments for specific user
router.get('/user/:userId', getUserAssignments);

// Create new assignment
router.post('/', createAssignment);

// Bulk save PTO (Excel-like view)
router.post('/bulk-pto', savePtoAssignments);

// Update assignment
router.put('/:id', updateAssignment);

// Delete assignment
router.delete('/:id', deleteAssignment);

module.exports = router;
