const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  updateProject, // Added
  deleteProject
} = require('../controllers/projectController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', getProjects);
router.post('/', protect, isAdmin, createProject);
router.put('/:id', protect, isAdmin, updateProject); // Added
router.delete('/:projectCode', protect, isAdmin, deleteProject);

module.exports = router;
