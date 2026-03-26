/**
 * Node Runtime API Server
 * 
 * Main entry point for the Mission Control backend API.
 */

import express from 'express';
import cors from 'cors';
import kinStatusRouter from './api/kin-status.js';
import healthRouter from './api/health.js';
import driftRouter from './api/drift.js';
import nftRouter from './api/nft.js';
import { createTailscaleRouter } from './api/tailscale.js';
import { createSupportRouter } from './api/support.js';
import { createSubscriptionRouter } from './api/subscription.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/kin', kinStatusRouter);
app.use('/api/health', healthRouter);
app.use('/api/drift', driftRouter);
app.use('/api/nft', nftRouter);
app.use('/api/tailscale', createTailscaleRouter());
app.use('/api/support', createSupportRouter());
app.use('/api/subscription', createSubscriptionRouter());

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Node Runtime API server running on port ${PORT}`);
  });
}

export default app;
