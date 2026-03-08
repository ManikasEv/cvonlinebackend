import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './models/database.models.js';
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

// Handle preflight requests explicitly
app.options('*', cors());

// Special handling for Stripe webhook (needs raw body)
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Body parser for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database (for serverless, this happens on each request)
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      console.log('🔄 Initializing database...');
      await initializeDatabase();
      dbInitialized = true;
      console.log('✅ Database initialized');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
    }
  }
  next();
});

// Clerk authentication middleware
app.use(clerkAuth);

// Health check endpoint (before auth)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'CV Creator API is running' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

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
