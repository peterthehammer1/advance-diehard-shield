const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const { initDatabase } = require('./db/init');
const phoneListsRouter = require('./routes/phone-lists');
const callsRouter = require('./routes/calls');
const simulationRouter = require('./routes/simulation');
const retellWebhookRouter = require('./routes/retell');
const retellAdminRouter = require('./routes/retell-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// Webhook routes — no auth required (Retell callbacks)
app.use('/webhook', retellWebhookRouter);

// Auth middleware — protect everything except login page, webhooks, and login assets
function requireAuth(req, res, next) {
  // Allow login page and its assets
  if (req.path === '/login.html' || req.path === '/login') return next();
  if (req.path === '/css/style.css') return next();
  if (req.path === '/AAP_Primary_HZ_RGB_Rev-Condensed.jpg') return next();

  if (req.session && req.session.authenticated) return next();

  // API requests get 401, page requests get redirected
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login.html');
}

// Login route
app.post('/login', (req, res) => {
  const { password } = req.body;
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;

  if (!dashboardPassword) {
    return res.status(500).json({ error: 'DASHBOARD_PASSWORD not configured' });
  }

  if (password === dashboardPassword) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }

  return res.status(401).json({ error: 'Invalid password' });
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

// Apply auth to all subsequent routes
app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/phone-lists', phoneListsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/retell', retellAdminRouter);

// SSE clients tracked globally for broadcasting
const sseClients = new Set();
app.set('sseClients', sseClients);

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
