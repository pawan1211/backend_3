const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes       = require('./routes/auth');
const bookingRoutes    = require('./routes/bookings');
const consultantRoutes = require('./routes/consultants');
const webhookRoutes    = require('./routes/webhooks');
const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please try again later.' },
});

app.use(limiter);
app.use(morgan('combined'));

// ── Body parsing ──────────────────────────────────────────────
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/bookings',    strictLimiter, bookingRoutes);
app.use('/api/consultants', consultantRoutes);
app.use('/webhooks',        webhookRoutes);

// ── Error handler ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('NexusIT API running on port ' + PORT);
});

module.exports = app;
