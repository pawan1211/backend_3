const { Router } = require('express');
const { query, withTransaction } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { createZoomMeeting, deleteZoomMeeting } = require('../services/zoom');
const { sendBookingConfirmation, sendConsultantNotification, sendCancellationEmail } = require('../services/email');

const router = Router();

// ── POST /api/bookings ────────────────────────────────────────
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { consultantId, scheduledAt, topic, notes } = req.body;

  if (!consultantId || !scheduledAt || !topic) {
    return res.status(400).json({ error: 'consultantId, scheduledAt, and topic are required.' });
  }

  if (new Date(scheduledAt) <= new Date()) {
    return res.status(400).json({ error: 'Booking must be scheduled in the future.' });
  }

  const { rows: [client] } = await query(
    'SELECT id, full_name, email, company FROM users WHERE supabase_id = $1',
    [req.user.supabaseId]
  );
  if (!client) return res.status(404).json({ error: 'User profile not found.' });

  const { rows: [consultant] } = await query(
    'SELECT c.id, c.specialty, c.timezone, u.full_name, u.email FROM consultants c JOIN users u ON u.id = c.user_id WHERE c.id = $1 AND c.is_active = true',
    [consultantId]
  );
  if (!consultant) return res.status(404).json({ error: 'Consultant not found.' });

  const { rows: conflicts } = await query(
    "SELECT id FROM bookings WHERE consultant_id = $1 AND status NOT IN ('cancelled') AND scheduled_at BETWEEN $2::timestamptz - INTERVAL '55 min' AND $2::timestamptz + INTERVAL '55 min'",
    [consultantId, scheduledAt]
  );
  if (conflicts.length > 0) {
    return res.status(409).json({ error: 'This time slot is no longer available.' });
  }

  const result = await withTransaction(async (txClient) => {
    const { rows: [booking] } = await txClient.query(
      "INSERT INTO bookings (client_id, consultant_id, scheduled_at, topic, notes, status) VALUES ($1,$2,$3,$4,$5,'confirmed') RETURNING *",
      [client.id, consultantId, scheduledAt, topic, notes]
    );

    let zoomData = {};
    try {
      zoomData = await createZoomMeeting({
        topic, scheduledAt,
        durationMins: booking.duration_mins,
        hostEmail: consultant.email,
        clientName: client.full_name,
      });
      await txClient.query(
        'UPDATE bookings SET zoom_meeting_id=$1, zoom_join_url=$2, zoom_start_url=$3, zoom_password=$4 WHERE id=$5',
        [zoomData.meetingId, zoomData.joinUrl, zoomData.startUrl, zoomData.password, booking.id]
      );
    } catch (zoomErr) {
      console.warn('Zoom meeting creation failed:', zoomErr.message);
    }

    return { booking, zoomData };
  });

  Promise.allSettled([
    sendBookingConfirmation({
      bookingId: result.booking.id,
      clientEmail: client.email,
      clientName: client.full_name,
      consultantName: consultant.full_name,
      consultantRole: consultant.specialty,
      scheduledAt,
      zoomJoinUrl: result.zoomData.joinUrl,
      referenceCode: result.booking.reference_code,
      topic,
    }),
    sendConsultantNotification({
      bookingId: result.booking.id,
      consultantEmail: consultant.email,
      consultantName: consultant.full_name,
      clientName: client.full_name,
      clientCompany: client.company,
      scheduledAt,
      zoomStartUrl: result.zoomData.startUrl,
      topic,
    }),
  ]).then(results => {
    results.forEach(r => { if (r.status === 'rejected') console.warn('Email error:', r.reason?.message); });
  });

  res.status(201).json({
    message: 'Booking confirmed!',
    booking: {
      id: result.booking.id,
      referenceCode: result.booking.reference_code,
      scheduledAt,
      status: 'confirmed',
      zoomJoinUrl: result.zoomData.joinUrl,
    },
  });
}));

// ── GET /api/bookings ─────────────────────────────────────────
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { status, limit = 20, offset = 0 } = req.query;
  const params = [req.user.supabaseId];
  let where = 'WHERE u.supabase_id = $1';
  if (status) { params.push(status); where += ' AND b.status = $' + params.length; }

  const { rows } = await query(
    'SELECT b.id, b.reference_code, b.scheduled_at, b.duration_mins, b.status, b.topic, b.zoom_join_url, b.created_at, cu.full_name AS consultant_name, c.specialty AS consultant_role FROM bookings b JOIN users u ON u.id = b.client_id JOIN consultants c ON c.id = b.consultant_id JOIN users cu ON cu.id = c.user_id ' + where + ' ORDER BY b.scheduled_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2),
    [...params, limit, offset]
  );

  res.json({ bookings: rows });
}));

// ── GET /api/bookings/:id ─────────────────────────────────────
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { rows: [booking] } = await query(
    'SELECT b.*, cu.full_name AS consultant_name, c.specialty, u.full_name AS client_name FROM bookings b JOIN users u ON u.id = b.client_id JOIN consultants c ON c.id = b.consultant_id JOIN users cu ON cu.id = c.user_id WHERE b.id = $1 AND u.supabase_id = $2',
    [req.params.id, req.user.supabaseId]
  );
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking });
}));

// ── PATCH /api/bookings/:id/cancel ───────────────────────────
router.patch('/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const { rows: [booking] } = await query(
    'SELECT b.*, u.email AS client_email, u.full_name AS client_name FROM bookings b JOIN users u ON u.id = b.client_id WHERE b.id = $1 AND u.supabase_id = $2',
    [req.params.id, req.user.supabaseId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Booking already cancelled.' });

  const hoursUntil = (new Date(booking.scheduled_at) - Date.now()) / 3600000;
  if (hoursUntil < 24) {
    return res.status(400).json({ error: 'Cancellations must be made at least 24 hours in advance.' });
  }

  await query(
    "UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancel_reason=$1 WHERE id=$2",
    [reason || null, booking.id]
  );

  if (booking.zoom_meeting_id) {
    deleteZoomMeeting(booking.zoom_meeting_id).catch(err => console.warn('Zoom cancel error:', err.message));
  }

  sendCancellationEmail({
    bookingId: booking.id,
    clientEmail: booking.client_email,
    clientName: booking.client_name,
    referenceCode: booking.reference_code,
    reason,
  }).catch(err => console.warn('Email cancel error:', err.message));

  res.json({ message: 'Booking cancelled successfully.' });
}));

// ── GET /api/bookings/admin/all ───────────────────────────────
router.get('/admin/all', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT b.id, b.reference_code, b.scheduled_at, b.status, b.topic, u.full_name AS client_name, u.email AS client_email, cu.full_name AS consultant_name, c.specialty FROM bookings b JOIN users u ON u.id = b.client_id JOIN consultants c ON c.id = b.consultant_id JOIN users cu ON cu.id = c.user_id ORDER BY b.scheduled_at DESC LIMIT 100'
  );
  res.json({ bookings: rows });
}));

module.exports = router;
