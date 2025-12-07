const { sendEmail } = require('../config/email');
const User = require('../models/User');

// Get all user and admin emails from Firestore
const getAllUserEmails = async () => {
  try {
    const users = await User.find({});
    return users.map(user => user.email).filter(email => email);
  } catch (error) {
    console.error('[Email Notifications] Error fetching user emails:', error);
    return [];
  }
};

// Get admin emails only
const getAdminEmails = async () => {
  try {
    const admins = await User.find({ role: 'admin' });
    return admins.map(admin => admin.email).filter(email => email);
  } catch (error) {
    console.error('[Email Notifications] Error fetching admin emails:', error);
    return [];
  }
};

// Generate alert email HTML template
const generateAlertEmailHTML = (alert) => {
  const levelColors = {
    ERROR: '#dc3545',
    SUCCESS: '#28a745',
    WARN: '#ffc107',
    INFO: '#17a2b8'
  };

  const levelEmojis = {
    ERROR: '🚨',
    SUCCESS: '✅',
    WARN: '⚠️',
    INFO: 'ℹ️'
  };

  const color = levelColors[alert.level] || '#6c757d';
  const emoji = levelEmojis[alert.level] || '📢';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
        }
        .header {
          background-color: ${color};
          color: white;
          padding: 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 20px;
          background-color: #f9f9f9;
        }
        .alert-details {
          background-color: white;
          padding: 15px;
          border-radius: 5px;
          margin: 10px 0;
        }
        .detail-row {
          display: flex;
          margin: 8px 0;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        .detail-label {
          font-weight: bold;
          min-width: 100px;
          color: #555;
        }
        .detail-value {
          flex: 1;
        }
        .footer {
          padding: 15px;
          text-align: center;
          font-size: 12px;
          color: #666;
          background-color: #f0f0f0;
        }
        .tags {
          display: inline-block;
          margin: 2px;
          padding: 3px 8px;
          background-color: #e9ecef;
          border-radius: 3px;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${emoji} New Alert: ${alert.level}</h1>
        </div>
        <div class="content">
          <div class="alert-details">
            <div class="detail-row">
              <span class="detail-label">Level:</span>
              <span class="detail-value"><strong style="color: ${color}">${alert.level}</strong></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Message:</span>
              <span class="detail-value">${alert.message}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Source:</span>
              <span class="detail-value">${alert.source}</span>
            </div>
            ${alert.tags && alert.tags.length > 0 ? `
            <div class="detail-row">
              <span class="detail-label">Tags:</span>
              <span class="detail-value">
                ${alert.tags.map(tag => `<span class="tags">${tag}</span>`).join(' ')}
              </span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">${new Date(alert.timestamp).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>Smart Home Alert System - Automated Notification</p>
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Generate plain text version
const generateAlertEmailText = (alert) => {
  const emoji = {
    ERROR: '🚨',
    SUCCESS: '✅',
    WARN: '⚠️',
    INFO: 'ℹ️'
  }[alert.level] || '📢';

  return `
${emoji} NEW ALERT: ${alert.level}

Level: ${alert.level}
Message: ${alert.message}
Source: ${alert.source}
${alert.tags && alert.tags.length > 0 ? `Tags: ${alert.tags.join(', ')}` : ''}
Time: ${new Date(alert.timestamp).toLocaleString()}

---
Smart Home Alert System - Automated Notification
This is an automated message. Please do not reply to this email.
  `.trim();
};

// Send alert notification to all users and admins
const sendAlertNotification = async (alert) => {
  try {
    // Check if email notifications are enabled
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
      console.log('[Email Notifications] Email not configured, skipping notifications');
      return { success: false, message: 'Email not configured' };
    }

    // Get all user emails
    const userEmails = await getAllUserEmails();

    if (userEmails.length === 0) {
      console.log('[Email Notifications] No users found with email addresses');
      return { success: false, message: 'No recipients found' };
    }

    console.log(`[Email Notifications] Sending alert notification to ${userEmails.length} users`);

    // Generate email content
    const subject = `${alert.level} Alert: ${alert.message.substring(0, 50)}${alert.message.length > 50 ? '...' : ''}`;
    const html = generateAlertEmailHTML(alert);
    const text = generateAlertEmailText(alert);

    // Send email to all users
    const emailPromises = userEmails.map(email =>
      sendEmail({
        to: email,
        subject,
        text,
        html
      }).catch(error => {
        console.error(`[Email Notifications] Failed to send to ${email}:`, error.message);
        return null;
      })
    );

    const results = await Promise.allSettled(emailPromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;

    console.log(`[Email Notifications] Sent ${successCount}/${userEmails.length} notifications successfully`);

    return {
      success: true,
      sent: successCount,
      total: userEmails.length,
      recipients: userEmails
    };
  } catch (error) {
    console.error('[Email Notifications] Error sending alert notifications:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendAlertNotification,
  getAllUserEmails,
  getAdminEmails
};
