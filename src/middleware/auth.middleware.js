import { clerkMiddleware, requireAuth as clerkRequireAuth } from '@clerk/express';
import dotenv from 'dotenv';

dotenv.config();

// Clerk middleware - requires both keys
export const clerkAuth = clerkMiddleware({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

// Middleware to verify Clerk authentication
export const requireAuth = clerkRequireAuth();

// Middleware to attach user info to request
export const attachUserInfo = (req, res, next) => {
  console.log('🔐 attachUserInfo middleware - req.auth:', req.auth);
  
  if (req.auth && req.auth.userId) {
    req.clerkUserId = req.auth.userId;
    console.log('✅ User authenticated:', req.clerkUserId);
    next();
  } else {
    console.log('❌ Unauthorized - no auth or userId');
    res.status(401).json({ error: 'Unauthorized' });
  }
};
