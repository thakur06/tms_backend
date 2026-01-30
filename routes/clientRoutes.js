const express = require('express');
const router = express.Router();
const {
  createClient,
  getClients
} = require('../controllers/clientController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

router.get('/', protect, getClients);
router.post('/', protect, isAdmin, createClient);

module.exports = router;
