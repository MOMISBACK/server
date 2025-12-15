const sendGridEmail = require('../utils/sendGridEmail');

// @route   POST /api/send-test-email
// @desc    Send a test email using SendGrid
// @access  Public
const sendTestEmail = async (req, res) => {
  try {
    await sendGridEmail(
      'matchmypac3@gmail.com',
      'Test SendGrid',
      'Ceci est un email de test via SendGrid.',
      '<strong>Ceci est un email de test via SendGrid.</strong>'
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  sendTestEmail,
};
