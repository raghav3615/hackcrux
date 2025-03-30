// services/email.js
const { getGmailClient } = require('./auth/googleAuth');

// Function to send email
async function sendEmail(to, subject, body) {
  try {
    const gmail = await getGmailClient();
    
    // Create the email in base64 encoded format
    const str = [
      `To: ${to}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      body
    ].join('\n');
    
    const encodedEmail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    // Send the email
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    });
    
    console.log('Email sent successfully:', res.data);
    return "Email sent successfully!";
  } catch (error) {
    console.error('Error sending email:', error);
    return `Error sending email: ${error.message}`;
  }
}

module.exports = { sendEmail };