const { Router } = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = Router();

router.post('/sync', requireAuth, asyncHandler(async (req, res) => {
  const { fullName, company, country, phone } = req.body;

  const { rows: [existing] } = await query(
    'SELECT id FROM users WHERE supabase_id = $1',
    [req.user.supabaseId]
  );

  if (existing) {
    return res.json({ message: 'Profile already synced.', userId: existing.id });
  }

  const { rows: [user] } = await query(
    'INSERT INTO users (supabase_id, email, full_name, company, country, phone, role) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [req.user.supabaseId, req.user.email, fullName, company, country, phone, 'client']
  );

  res.status(201).json({ message: 'Profile created.', userId: user.id });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows: [user] } = await query(
    'SELECT id, email, full_name, company, country, phone, avatar_url, role, created_at FROM users WHERE supabase_id = $1',
    [req.user.supabaseId]
  );
  if (!user) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ user });
}));

router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const { fullName, company, country, phone } = req.body;
  const { rows: [user] } = await query(
    'UPDATE users SET full_name=COALESCE($1,full_name), company=COALESCE($2,company), country=COALESCE($3,country), phone=COALESCE($4,phone) WHERE supabase_id=$5 RETURNING id, email, full_name, company',
    [fullName, company, country, phone, req.user.supabaseId]
  );
  res.json({ user });
}));

module.exports = router;
