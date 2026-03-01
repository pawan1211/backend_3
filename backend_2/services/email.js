const sgMail = require('@sendgrid/mail');
const { query } = require('../db/pool');
require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL || 'noreply@nexusit.com',
  name:  'NexusIT Consulting',
};

const send = async ({ to, subject, html, bookingId, templateName }) => {
  try {
    const [res] = await sgMail.send({ to, from: FROM, subject, html });
    const msgId = res?.headers?.['x-message-id'] || null;
    if (bookingId) {
      await query(
        "INSERT INTO email_logs (booking_id, recipient, template_name, sendgrid_msg_id, status) VALUES ($1,$2,$3,$4,'sent')",
        [bookingId, to, templateName, msgId]
      );
    }
    return { success: true };
  } catch (err) {
    console.error('SendGrid Error:', err.response?.body || err.message);
    if (bookingId) {
      await query(
        "INSERT INTO email_logs (booking_id, recipient, template_name, status) VALUES ($1,$2,$3,'failed')",
        [bookingId, to, templateName]
      );
    }
    throw err;
  }
};

const sendBookingConfirmation = async ({ bookingId, clientEmail, clientName, consultantName, consultantRole, scheduledAt, zoomJoinUrl, referenceCode, topic }) => {
  const date = new Date(scheduledAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });
  const html = `
  <div style="font-family:Georgia,serif;background:#0a0a0a;color:#e8e4dc;max-width:600px;margin:0 auto;padding:40px 32px;">
    <h2 style="letter-spacing:3px;">NEXUS<span style="color:#c9a84c;">IT</span></h2>
    <h1 style="font-size:26px;">Booking Confirmed ✅</h1>
    <p style="color:#888;font-family:system-ui;">Hi ${clientName}, your consultation has been scheduled.</p>
    <div style="background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:24px;margin:24px 0;font-family:system-ui;font-size:14px;">
      <p><span style="color:#666;">Reference:</span> <span style="color:#c9a84c;">${referenceCode}</span></p>
      <p><span style="color:#666;">Consultant:</span> ${consultantName} — ${consultantRole}</p>
      <p><span style="color:#666;">Date & Time:</span> ${date} UTC</p>
      <p><span style="color:#666;">Duration:</span> 60 minutes</p>
      <p><span style="color:#666;">Topic:</span> ${topic}</p>
    </div>
    ${zoomJoinUrl ? `<div style="text-align:center;margin:32px 0;"><a href="${zoomJoinUrl}" style="background:#c9a84c;color:#000;padding:14px 32px;border-radius:4px;font-weight:700;text-decoration:none;font-family:system-ui;">Join Video Call →</a></div>` : ''}
    <p style="color:#555;font-family:system-ui;font-size:13px;border-top:1px solid #1e1e1e;padding-top:20px;margin-top:40px;">© 2025 NexusIT Consulting · Serving 47 countries</p>
  </div>`;
  return send({ to: clientEmail, subject: 'Confirmed: Your NexusIT Consultation – ' + referenceCode, html, bookingId, templateName: 'booking_confirmation' });
};

const sendConsultantNotification = async ({ bookingId, consultantEmail, consultantName, clientName, clientCompany, scheduledAt, zoomStartUrl, topic }) => {
  const date = new Date(scheduledAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });
  const html = `
  <div style="font-family:Georgia,serif;background:#0a0a0a;color:#e8e4dc;max-width:600px;margin:0 auto;padding:40px 32px;">
    <h2 style="letter-spacing:3px;">NEXUS<span style="color:#c9a84c;">IT</span></h2>
    <h1 style="font-size:24px;">New Booking Assigned 📅</h1>
    <p style="color:#888;font-family:system-ui;">Hi ${consultantName}, a client has booked a session with you.</p>
    <div style="background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:24px;margin:24px 0;font-family:system-ui;font-size:14px;">
      <p><span style="color:#666;">Client:</span> ${clientName}</p>
      <p><span style="color:#666;">Company:</span> ${clientCompany || 'Individual'}</p>
      <p><span style="color:#666;">Date & Time:</span> ${date} UTC</p>
      <p><span style="color:#666;">Topic:</span> <span style="color:#c9a84c;">${topic}</span></p>
    </div>
    ${zoomStartUrl ? `<div style="text-align:center;"><a href="${zoomStartUrl}" style="background:#c9a84c;color:#000;padding:14px 32px;border-radius:4px;font-weight:700;text-decoration:none;font-family:system-ui;">Start Meeting (Host)</a></div>` : ''}
  </div>`;
  return send({ to: consultantEmail, subject: 'New Booking: ' + clientName + ' – ' + date, html, bookingId, templateName: 'consultant_notification' });
};

const sendCancellationEmail = async ({ bookingId, clientEmail, clientName, referenceCode, reason }) => {
  const html = `
  <div style="font-family:Georgia,serif;background:#0a0a0a;color:#e8e4dc;max-width:600px;margin:0 auto;padding:40px 32px;">
    <h2 style="letter-spacing:3px;">NEXUS<span style="color:#c9a84c;">IT</span></h2>
    <h1 style="font-size:24px;">Booking Cancelled</h1>
    <p style="color:#888;font-family:system-ui;">Hi ${clientName}, booking <strong style="color:#c9a84c;">${referenceCode}</strong> has been cancelled.</p>
    ${reason ? '<p style="color:#666;font-family:system-ui;">Reason: ' + reason + '</p>' : ''}
    <p style="color:#888;font-family:system-ui;margin-top:24px;">You can book a new session at any time from your dashboard.</p>
  </div>`;
  return send({ to: clientEmail, subject: 'Booking Cancelled – ' + referenceCode, html, bookingId, templateName: 'booking_cancelled' });
};

module.exports = { sendBookingConfirmation, sendConsultantNotification, sendCancellationEmail };
