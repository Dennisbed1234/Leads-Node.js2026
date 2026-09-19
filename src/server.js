const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, serverless: !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) });
});

// Database check (optional) – only on cold start when not disabled
const dbDisabled = ['1', 'true', 'yes'].includes((process.env.DB_DISABLED || '').toLowerCase());
if (dbDisabled) {
  console.log('ℹ️ Database connection skipped (DB_DISABLED=true).');
} else {
  db.getConnection()
    .then((connection) => {
      console.log('✅ Connected to Database');
      connection.release();
    })
    .catch((err) => {
      console.error('❌ Database connection failed:', err.message);
    });
}

// Local / traditional hosting
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel / serverless
module.exports = app;
