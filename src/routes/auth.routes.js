import express from 'express';
import { createUser, getUserByClerkId } from '../models/database.models.js';
import { getAuth, clerkClient } from '@clerk/express';

const router = express.Router();

/**
 * POST /api/auth/sync
 * Sync user from Clerk to NeonDB
 * Called after Clerk sign-up
 */
router.post('/sync', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check if user already exists
    const existingUser = await getUserByClerkId(userId);
    
    if (existingUser) {
      return res.status(200).json({ 
        message: 'User already exists', 
        user: existingUser 
      });
    }

    // Get real user data from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    
    // Create new user in database with real Clerk data
    const newUser = await createUser(
      userId,
      clerkUser.emailAddresses[0]?.emailAddress || 'no-email@example.com',
      clerkUser.firstName || 'User',
      clerkUser.lastName || ''
    );
    
    res.status(201).json({ 
      message: 'User created successfully', 
      user: newUser 
    });
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

/**
 * GET /api/auth/user
 * Get current user info
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await getUserByClerkId(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
