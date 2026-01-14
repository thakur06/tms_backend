const express = require('express');
const router = express.Router();
const {
  createDept,
  getDepts
} = require('../controllers/deptController');

router.post('/', createDept);
router.get('/', getDepts);

module.exports = router;
