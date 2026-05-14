require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initDb } = require('./db');

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

const start = async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Aging-in-Place Assessor API running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
module.exports = app;

// BATCH_00_AUDIT_MOUNTS
app.use('/api/home-vision', require('./routes/homeVision'));
app.use('/api/injury-risk', require('./routes/injuryRisk'));
app.use('/api/contractor-marketplace', require('./routes/contractorMarketplace'));
app.use('/api/insurance-workflow', require('./routes/insuranceWorkflow'));
app.use('/api/roi-tracking', require('./routes/roiTracking'));

// === Batch 00 Gaps & Frontend Mounts ===
app.use('/api/gap-limited-ai-fall-risk-prediction', require('./routes/gap_limited_ai_fall_risk_prediction'));
app.use('/api/gap-ai-contractor-matching-skill-plus', require('./routes/gap_ai_contractor_matching_skill_plus'));
app.use('/api/gap-ai-cost-estimation-pipeline-material', require('./routes/gap_ai_cost_estimation_pipeline_material'));
app.use('/api/gap-ai-accessibility-score-generation', require('./routes/gap_ai_accessibility_score_generation'));
app.use('/api/gap-ai-roi-modeling-cost-vs', require('./routes/gap_ai_roi_modeling_cost_vs'));
app.use('/api/gap-photo-upload-image-based-home', require('./routes/gap_photo_upload_image_based_home'));
app.use('/api/gap-contractor-collaboration-shared-quote-review', require('./routes/gap_contractor_collaboration_shared_quote_review'));
app.use('/api/gap-insurance-claim-documentation-guidance', require('./routes/gap_insurance_claim_documentation_guidance'));
app.use('/api/gap-post-modification-follow-up-effectiveness', require('./routes/gap_post_modification_follow_up_effectiveness'));
app.use('/api/gap-notifications-subsystem', require('./routes/gap_notifications_subsystem'));
app.use('/api/gap-outbound-webhooks', require('./routes/gap_outbound_webhooks'));
