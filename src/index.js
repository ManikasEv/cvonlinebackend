import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { clerkAuth } from './middleware/auth.middleware.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import cvRoutes from './routes/cv.routes.js';
import paymentRoutes from './routes/payment.routes.js';

dotenv.config();

const app = express();

// CORS Configuration for Vercel
app.use(cors({
  origin: ['https://cvonlinestripeclerk.netlify.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests FIRST (before any other middleware)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
});

// Health check endpoints (NO middleware needed)
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: '✅ Connected', 
    message: 'CV Creator API - Ready to serve',
    endpoints: {
      auth: '/api/auth/*',
      cvs: '/api/cvs/*',
      payment: '/api/payment/*'
    }
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Raw body for webhook ONLY
app.use((req, res, next) => {
  if (req.path === '/api/payment/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    next();
  }
});

// JSON body parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication middleware (only for /api routes)
app.use('/api', clerkAuth);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cvs', cvRoutes);
app.use('/api/payment', paymentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

// Export for Vercel
export default app;
