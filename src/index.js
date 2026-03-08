import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { clerkMiddleware } from '@clerk/express';
import authRoutes from './routes/auth.routes.js';
import cvRoutes from './routes/cv.routes.js';
import paymentRoutes from './routes/payment.routes.js';

dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    'https://cvonlinestripeclerk.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle preflight for ALL routes BEFORE other middleware
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'Connected',
    message: 'API Ready'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Clerk auth for API routes only (after OPTIONS handling)
app.use('/api', (req, res, next) => {
  // Skip Clerk for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }
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
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;