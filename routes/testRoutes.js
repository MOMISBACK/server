const express = require('express');
const router = express.Router();
const { sendTestEmail } = require('../controllers/testController');

router.post('/send-test-email', sendTestEmail);

module.exports = router;
