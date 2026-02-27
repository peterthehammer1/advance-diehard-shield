const express = require('express');
const path = require('path');
const { initDatabase } = require('./db/init');
const phoneListsRouter = require('./routes/phone-lists');
const callsRouter = require('./routes/calls');
const simulationRouter = require('./routes/simulation');
const retellWebhookRouter = require('./routes/retell');
const retellAdminRouter = require('./routes/retell-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/phone-lists', phoneListsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/simulation', simulationRouter);
app.use('/webhook', retellWebhookRouter);
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
