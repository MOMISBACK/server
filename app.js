// server/app.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const activityRoutes = require('./routes/activityRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const stravaRoutes = require('./routes/stravaRoutes');

const app = express();

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARES
// ═══════════════════════════════════════════════════════════════════════════

// Helmet for security headers
app.use(helmet());

// CORS
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

// General API rate limiter: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { success: false, message: 'Trop de requêtes. Réessaie dans 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // Don't limit health checks
});

// Stricter limiter for auth routes: 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, message: 'Trop de tentatives. Réessaie dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general limiter to all API routes
app.use('/api', generalLimiter);

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Auth routes with stricter rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/strava', stravaRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

module.exports = app;