import sql from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration script to add subscription columns to existing users table
 * Run this once to update your Neon database
 */
async function addSubscriptionColumns() {
  console.log('\n========================================');
  console.log('🔧 [MIGRATION] Adding subscription columns to users table...');
  console.log('========================================');
  
  try {
    // Check if columns exist
    console.log('🔍 [MIGRATION] Checking existing columns...');
    const existingColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `;
    
    const columnNames = existingColumns.map(col => col.column_name);
    console.log('📋 [MIGRATION] Existing columns:', columnNames);
    
    // Add stripe_customer_id if it doesn't exist
    if (!columnNames.includes('stripe_customer_id')) {
      console.log('➕ [MIGRATION] Adding stripe_customer_id column...');
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)
      `;
      console.log('✅ [MIGRATION] stripe_customer_id column added');
    } else {
      console.log('✅ [MIGRATION] stripe_customer_id column already exists');
    }
    
    // Add stripe_subscription_id if it doesn't exist
    if (!columnNames.includes('stripe_subscription_id')) {
      console.log('➕ [MIGRATION] Adding stripe_subscription_id column...');
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)
      `;
      console.log('✅ [MIGRATION] stripe_subscription_id column added');
    } else {
      console.log('✅ [MIGRATION] stripe_subscription_id column already exists');
    }
    
    // Add subscription_status if it doesn't exist
    if (!columnNames.includes('subscription_status')) {
      console.log('➕ [MIGRATION] Adding subscription_status column...');
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'inactive'
      `;
      console.log('✅ [MIGRATION] subscription_status column added');
    } else {
      console.log('✅ [MIGRATION] subscription_status column already exists');
    }
    
    // Verify the changes
    console.log('\n🔍 [MIGRATION] Verifying final table structure...');
    const finalColumns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `;
    
    console.log('📋 [MIGRATION] Final users table structure:');
    finalColumns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });
    
    console.log('\n✅ [MIGRATION] Migration completed successfully!');
    console.log('========================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ [MIGRATION] Migration failed:', error.message);
    console.error('❌ [MIGRATION] Error details:', error);
    console.log('========================================\n');
    process.exit(1);
  }
}

// Run the migration
addSubscriptionColumns();
