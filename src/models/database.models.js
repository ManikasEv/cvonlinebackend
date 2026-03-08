import sql from '../config/database.js';

/**
 * Initialize database tables
 * Creates users and cvs tables if they don't exist
 */
export async function initializeDatabase() {
  console.log('\n========================================');
  console.log('🗄️  [DATABASE] Initializing database tables...');
  console.log('========================================');
  
  try {
    // Create users table
    console.log('📋 [DATABASE] Creating users table if not exists...');
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        has_premium BOOLEAN DEFAULT FALSE,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        subscription_status VARCHAR(50) DEFAULT 'inactive',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ [DATABASE] Users table ready');

    // Create cvs table
    console.log('📋 [DATABASE] Creating cvs table if not exists...');
    await sql`
      CREATE TABLE IF NOT EXISTS cvs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        template_type VARCHAR(50) DEFAULT 'basic',
        personal_info JSONB,
        education JSONB,
        experience JSONB,
        skills JSONB,
        languages JSONB,
        certifications JSONB,
        projects JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ [DATABASE] CVs table ready');

    // Create payments table
    console.log('📋 [DATABASE] Creating payments table if not exists...');
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        stripe_payment_id VARCHAR(255) UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'usd',
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ [DATABASE] Payments table ready');

    console.log('✅ [DATABASE] All tables initialized successfully');
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ [DATABASE] Error initializing database:', error);
    console.error('❌ [DATABASE] Error details:', error.message);
    console.error('❌ [DATABASE] Error stack:', error.stack);
    console.log('========================================\n');
    throw error;
  }
}

/**
 * Create a new user in the database
 */
export async function createUser(clerkUserId, email, firstName, lastName) {
  console.log('💾 [DB CREATE USER] Attempting to create user...');
  console.log('📊 [DB CREATE USER] Data:', {
    clerkUserId,
    email,
    firstName,
    lastName
  });
  
  try {
    const result = await sql`
      INSERT INTO users (clerk_user_id, email, first_name, last_name)
      VALUES (${clerkUserId}, ${email}, ${firstName}, ${lastName})
      RETURNING *
    `;
    
    console.log('✅ [DB CREATE USER] User inserted successfully');
    console.log('📊 [DB CREATE USER] Result:', {
      id: result[0].id,
      clerk_user_id: result[0].clerk_user_id,
      email: result[0].email
    });
    
    return result[0];
  } catch (error) {
    console.error('❌ [DB CREATE USER] Error creating user:', error.message);
    console.error('❌ [DB CREATE USER] Error code:', error.code);
    console.error('❌ [DB CREATE USER] Error detail:', error.detail);
    console.error('❌ [DB CREATE USER] Full error:', error);
    throw error;
  }
}

/**
 * Get user by Clerk user ID
 */
export async function getUserByClerkId(clerkUserId) {
  console.log('🔍 [DB GET USER] Searching for user with Clerk ID:', clerkUserId);
  
  try {
    const result = await sql`
      SELECT * FROM users WHERE clerk_user_id = ${clerkUserId}
    `;
    
    if (result[0]) {
      console.log('✅ [DB GET USER] User found:', {
        id: result[0].id,
        email: result[0].email,
        has_premium: result[0].has_premium
      });
    } else {
      console.log('⚠️ [DB GET USER] User not found in database');
    }
    
    return result[0] || null;
  } catch (error) {
    console.error('❌ [DB GET USER] Error getting user:', error.message);
    console.error('❌ [DB GET USER] Full error:', error);
    throw error;
  }
}

/**
 * Update user premium status
 */
export async function updateUserPremium(userId, hasPremium, stripeCustomerId = null) {
  console.log('🔄 [DB UPDATE PREMIUM] Updating user premium status...');
  console.log('📊 [DB UPDATE PREMIUM] Data:', {
    userId,
    hasPremium,
    stripeCustomerId
  });
  
  try {
    const result = await sql`
      UPDATE users 
      SET has_premium = ${hasPremium}, 
          stripe_customer_id = ${stripeCustomerId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
      RETURNING *
    `;
    
    console.log('✅ [DB UPDATE PREMIUM] User premium status updated');
    console.log('📊 [DB UPDATE PREMIUM] Result:', {
      id: result[0].id,
      has_premium: result[0].has_premium,
      stripe_customer_id: result[0].stripe_customer_id
    });
    
    return result[0];
  } catch (error) {
    console.error('❌ [DB UPDATE PREMIUM] Error updating user premium:', error.message);
    console.error('❌ [DB UPDATE PREMIUM] Full error:', error);
    throw error;
  }
}
