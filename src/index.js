import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { clerkMiddleware } from '@clerk/express';
import authRoutes from './routes/auth.routes.js';
import cvRoutes from './routes/cv.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import { initializeDatabase } from './models/database.models.js';

dotenv.config();

const app = express();

// Initialize database tables on startup
console.log('\n🚀 [SERVER] Starting CV Creator Backend...');
console.log('🌍 [SERVER] Environment:', process.env.NODE_ENV || 'development');
console.log('📍 [SERVER] Database URL configured:', process.env.DATABASE_URL ? 'YES ✅' : 'NO ❌');
console.log('🔐 [SERVER] Clerk keys configured:', {
  publishable: process.env.CLERK_PUBLISHABLE_KEY ? 'YES ✅' : 'NO ❌',
  secret: process.env.CLERK_SECRET_KEY ? 'YES ✅' : 'NO ❌'
});
console.log('💳 [SERVER] Stripe keys configured:', {
  secret: process.env.STRIPE_SECRET_KEY ? 'YES ✅' : 'NO ❌',
  publishable: process.env.STRIPE_PUBLISHABLE_KEY ? 'YES ✅' : 'NO ❌',
  webhook: process.env.STRIPE_WEBHOOK_SECRET ? 'YES ✅' : 'NO ❌'
});

initializeDatabase().catch(err => {
  console.error('❌ [SERVER] Failed to initialize database:', err);
});

// CORS configuration - must be FIRST
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://cvonlinestripeclerk.netlify.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ];
    
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Explicit OPTIONS handler for preflight - MUST come before body parsing
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400');
  return res.status(200).end();
});

// Parse JSON for all routes EXCEPT webhook
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/webhook')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Hello World! 🌍',
    status: 'Connected',
    timestamp: new Date().toISOString(),
    api: 'CV Creator Backend',
    version: '1.0.0'
  });
});

app.get('/health', async (req, res) => {
  try {
    // Import sql here to test database connection
    const { default: sql } = await import('./config/database.js');
    const result = await sql`SELECT 1 as health`;
    res.status(200).json({ 
      status: 'ok', 
      database: result ? 'connected' : 'disconnected' 
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Clerk auth for API routes only (after OPTIONS handling)
app.use('/api', (req, res, next) => {
  console.log(`🔐 [AUTH MIDDLEWARE] ${req.method} ${req.path}`);
  console.log('📋 [AUTH MIDDLEWARE] Origin:', req.headers.origin);
  
  // Skip Clerk for OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log('✅ [AUTH MIDDLEWARE] OPTIONS request - skipping authentication');
    return next();
  }
  
  // Skip Clerk for Stripe webhook
  if (req.path === '/payment/webhook') {
    console.log('✅ [AUTH MIDDLEWARE] Webhook request - skipping authentication');
    return next();
  }
  
  console.log('🔍 [AUTH MIDDLEWARE] Checking Clerk authentication...');
  
  return clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY
  })(req, res, next);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/cvs', cvRoutes);
app.use('/api/payment', paymentRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// For local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log('\n========================================');
    console.log(`✅ [SERVER] Server running on port ${PORT}`);
    console.log(`🌐 [SERVER] Local URL: http://localhost:${PORT}`);
    console.log(`📋 [SERVER] Health check: http://localhost:${PORT}/health`);
    console.log('========================================\n');
  });
} else {
  console.log('✅ [SERVER] Running in production mode (serverless)');
}

export default app;