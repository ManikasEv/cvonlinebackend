import sql from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration script to add enhanced CV fields
 * Adds columns for profile picture, attachments, etc.
 */
async function addCVEnhancements() {
  console.log('\n========================================');
  console.log('🔧 [MIGRATION] Adding CV enhancement columns...');
  console.log('========================================');
  
  try {
    // Check if columns exist
    console.log('🔍 [MIGRATION] Checking existing columns in cvs table...');
    const existingColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'cvs'
    `;
    
    const columnNames = existingColumns.map(col => col.column_name);
    console.log('📋 [MIGRATION] Existing columns:', columnNames);
    
    // Add profile_picture_url if it doesn't exist
    if (!columnNames.includes('profile_picture_url')) {
      console.log('➕ [MIGRATION] Adding profile_picture_url column...');
      await sql`
        ALTER TABLE cvs 
        ADD COLUMN IF NOT EXISTS profile_picture_url TEXT
      `;
      console.log('✅ [MIGRATION] profile_picture_url column added');
    } else {
      console.log('✅ [MIGRATION] profile_picture_url column already exists');
    }
    
    // Add driving_license if it doesn't exist
    if (!columnNames.includes('driving_license')) {
      console.log('➕ [MIGRATION] Adding driving_license column...');
      await sql`
        ALTER TABLE cvs 
        ADD COLUMN IF NOT EXISTS driving_license JSONB DEFAULT '{"has_license": false, "categories": []}'::jsonb
      `;
      console.log('✅ [MIGRATION] driving_license column added');
    } else {
      console.log('✅ [MIGRATION] driving_license column already exists');
    }
    
    // Add attachments if it doesn't exist
    if (!columnNames.includes('attachments')) {
      console.log('➕ [MIGRATION] Adding attachments column...');
      await sql`
        ALTER TABLE cvs 
        ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb
      `;
      console.log('✅ [MIGRATION] attachments column added');
    } else {
      console.log('✅ [MIGRATION] attachments column already exists');
    }
    
    // Verify the changes
    console.log('\n🔍 [MIGRATION] Verifying final table structure...');
    const finalColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'cvs'
      ORDER BY ordinal_position
    `;
    
    console.log('📋 [MIGRATION] Final cvs table structure:');
    finalColumns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
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
addCVEnhancements();
