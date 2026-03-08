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
  console.log('\n========================================');
  console.log('🔄 [AUTH SYNC] Request received');
  console.log('========================================');
  
  try {
    const { userId } = getAuth(req);
    console.log('📋 [AUTH SYNC] Extracted Clerk User ID:', userId || 'NONE');
    
    if (!userId) {
      console.log('❌ [AUTH SYNC] No userId - Unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check if user already exists
    console.log('🔍 [AUTH SYNC] Checking if user exists in database...');
    const existingUser = await getUserByClerkId(userId);
    
    if (existingUser) {
      console.log('✅ [AUTH SYNC] User already exists in database');
      console.log('📊 [AUTH SYNC] User data:', {
        id: existingUser.id,
        email: existingUser.email,
        name: `${existingUser.first_name} ${existingUser.last_name}`,
        premium: existingUser.has_premium
      });
      return res.status(200).json({ 
        message: 'User already exists', 
        user: existingUser 
      });
    }

    console.log('⚠️ [AUTH SYNC] User NOT found in database - Creating new user');
    
    // Get real user data from Clerk
    console.log('🔍 [AUTH SYNC] Fetching user data from Clerk API...');
    const clerkUser = await clerkClient.users.getUser(userId);
    
    const userData = {
      clerkId: userId,
      email: clerkUser.emailAddresses[0]?.emailAddress || 'no-email@example.com',
      firstName: clerkUser.firstName || 'User',
      lastName: clerkUser.lastName || ''
    };
    
    console.log('📧 [AUTH SYNC] Clerk user data retrieved:', userData);
    
    // Create new user in database with real Clerk data
    console.log('💾 [AUTH SYNC] Inserting user into database...');
    const newUser = await createUser(
      userData.clerkId,
      userData.email,
      userData.firstName,
      userData.lastName
    );
    
    console.log('✅ [AUTH SYNC] User created successfully in database!');
    console.log('📊 [AUTH SYNC] New user data:', {
      id: newUser.id,
      email: newUser.email,
      name: `${newUser.first_name} ${newUser.last_name}`
    });
    console.log('========================================\n');
    
    res.status(201).json({ 
      message: 'User created successfully', 
      user: newUser 
    });
  } catch (error) {
    console.error('❌ [AUTH SYNC] Error syncing user:', error);
    console.error('❌ [AUTH SYNC] Error stack:', error.stack);
    console.log('========================================\n');
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

/**
 * GET /api/auth/user
 * Get current user info
 */
router.get('/user', async (req, res) => {
  console.log('\n========================================');
  console.log('👤 [GET USER] Request received');
  console.log('========================================');
  
  try {
    const { userId } = getAuth(req);
    console.log('📋 [GET USER] Clerk User ID:', userId || 'NONE');
    
    if (!userId) {
      console.log('❌ [GET USER] No userId - Unauthorized');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('🔍 [GET USER] Querying database for user...');
    const user = await getUserByClerkId(userId);
    
    if (!user) {
      console.log('❌ [GET USER] User not found in database');
      console.log('========================================\n');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ [GET USER] User found in database');
    console.log('📊 [GET USER] User data:', {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      premium: user.has_premium
    });
    console.log('========================================\n');

    res.status(200).json({ user });
  } catch (error) {
    console.error('❌ [GET USER] Error getting user:', error);
    console.error('❌ [GET USER] Error stack:', error.stack);
    console.log('========================================\n');
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
