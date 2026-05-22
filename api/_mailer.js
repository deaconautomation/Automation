const nodemailer = require('nodemailer');

function getTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'vela.automate@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendEmail({ to, subject, html, from }) {
  const sender = from || `Vela <${process.env.GMAIL_USER || 'vela.automate@gmail.com'}>`;
  await getTransport().sendMail({ from: sender, to, subject, html });
}

module.exports = { sendEmail };
