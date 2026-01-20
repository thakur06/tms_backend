const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  deleteProject
} = require('../controllers/projectController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', getProjects);
router.post('/', protect, isAdmin, createProject);
router.delete('/:projectCode', protect, isAdmin, deleteProject);

module.exports = router;
