const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendGridEmail(to, subject, text, html) {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM_EMAIL, // adresse expéditeur validée sur SendGrid
    subject,
    text,
    html,
  };
  try {
    await sgMail.send(msg);
    console.log('✅ Email envoyé à', to);
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    throw error;
  }
}

module.exports = sendGridEmail;
