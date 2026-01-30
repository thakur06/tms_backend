const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasks,
  deleteTask
} = require('../controllers/taskController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

router.post('/', protect, isAdmin, createTask);
router.get('/', protect, getTasks);
router.delete('/:taskId', protect, isAdmin, deleteTask);

module.exports = router;
