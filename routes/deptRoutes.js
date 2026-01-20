const express = require('express');
const router = express.Router();
const {
  createDept,
  getDepts
} = require('../controllers/deptController');

const { protect } = require('../middlewares/authMiddleware');

router.post('/', protect, createDept);
router.get('/', protect, getDepts);

module.exports = router;
