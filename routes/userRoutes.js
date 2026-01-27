const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  assignReportingManager,
  getAvailableManagers,
  getTeamMembers,
  updateManagerStatus,
  updateUser,
  deleteUser
} = require('../controllers/userController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

// User CRUD
router.post('/', protect, isAdmin, createUser);
router.get('/', protect, getUsers);
router.put('/:id', protect, isAdmin, updateUser);
router.delete('/:id', protect, isAdmin, require('../controllers/userController').deleteUser);

// Manager operations - static routes MUST come before parameterized routes
router.get('/managers', protect, getAvailableManagers);
router.get('/:id/team', protect, getTeamMembers);
router.put('/:id/manager', protect, assignReportingManager);
router.put('/:id/manager-status', protect, updateManagerStatus);

module.exports = router;
