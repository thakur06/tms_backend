const express = require('express');
const router = express.Router();
const { login, sendOTP, verifyOTP, resetPassword, setPassword } = require('../controllers/authController');

router.post('/login', login);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);
router.post('/set-password', setPassword);

module.exports = router;