const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  deleteProject
} = require('../controllers/projectController');

router.get('/', getProjects);
router.post('/', createProject);
router.delete('/:projectCode', deleteProject);

module.exports = router;
