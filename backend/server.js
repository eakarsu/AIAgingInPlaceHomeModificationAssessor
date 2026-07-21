require('dotenv').config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { generalLimiter, authLimiter, aiRateLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const homesRoutes = require('./routes/homes');
const assessmentsRoutes = require('./routes/assessments');
const modificationsRoutes = require('./routes/modifications');
const contractorsRoutes = require('./routes/contractors');
const aiRoutes = require('./routes/ai');
const profilesRoutes = require('./routes/profiles');
const quotesRoutes = require('./routes/quotes');
const fallRiskRoutes = require('./routes/fallRisk');
const customViewsRoutes = require('./routes/customViews');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiter to all routes
app.use(generalLimiter);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Aging-in-Place Home Modification Assessor', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/homes', homesRoutes);
app.use('/api/assessments', assessmentsRoutes);
app.use('/api/modifications', modificationsRoutes);
app.use('/api/contractors', contractorsRoutes);
app.use('/api/ai', aiRateLimiter, aiRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/fall-risk-history', fallRiskRoutes);
app.use('/api/custom-views', customViewsRoutes);
app.use('/api/evacuation-readiness', require('./routes/evacuationReadiness'));
app.use('/api/care-workflows', require('./routes/careWorkflow'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.originalUrl} does not exist` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Aging-in-Place Assessor API running on port ${PORT}`);
});
module.exports = app;
