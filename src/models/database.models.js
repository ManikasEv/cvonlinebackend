import sql from '../config/database.js';

/**
 * Initialize database tables
 * Creates users and cvs tables if they don't exist
 */
export async function initializeDatabase() {
  try {
    // Create users table
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

    // Create cvs table
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

    // Create payments table
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

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

/**
 * Create a new user in the database
 */
export async function createUser(clerkUserId, email, firstName, lastName) {
  try {
    const result = await sql`
      INSERT INTO users (clerk_user_id, email, first_name, last_name)
      VALUES (${clerkUserId}, ${email}, ${firstName}, ${lastName})
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Get user by Clerk user ID
 */
export async function getUserByClerkId(clerkUserId) {
  try {
    const result = await sql`
      SELECT * FROM users WHERE clerk_user_id = ${clerkUserId}
    `;
    return result[0] || null;
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

/**
 * Update user premium status
 */
export async function updateUserPremium(userId, hasPremium, stripeCustomerId = null) {
  try {
    const result = await sql`
      UPDATE users 
      SET has_premium = ${hasPremium}, 
          stripe_customer_id = ${stripeCustomerId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error updating user premium:', error);
    throw error;
  }
}
