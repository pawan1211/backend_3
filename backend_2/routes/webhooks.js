const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../db/pool');

const router = Router();

router.post('/zoom', async (req, res) => {
  res.status(200).json({ received: true });

  const signature = req.headers['x-zm-signature'];
  const timestamp  = req.headers['x-zm-request-timestamp'];
  const message    = 'v0:' + timestamp + ':' + req.body;
  const hash       = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '').update(message).digest('hex');

  if (signature !== 'v0=' + hash) {
    console.warn('Zoom Webhook: Invalid signature');
    return;
  }

  let event;
  try { event = JSON.parse(req.body.toString()); } catch { return; }

  const { event: eventType, payload } = event;

  if (eventType === 'meeting.ended') {
    const meetingId = String(payload?.object?.id);
    await query(
      "UPDATE bookings SET status='completed' WHERE zoom_meeting_id = $1",
      [meetingId]
    ).catch(console.error);
  }
});

module.exports = router;
