import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Adding assigned_technician_ids column to project_tasks table...');

  await pool.query(`
    ALTER TABLE project_tasks 
    ADD COLUMN IF NOT EXISTS assigned_technician_ids text[] DEFAULT '{}';
  `);

  // For any tasks where assigned_technician_ids is empty but assigned_to_id is set, populate it
  await pool.query(`
    UPDATE project_tasks
    SET assigned_technician_ids = ARRAY[assigned_to_id::text]
    WHERE assigned_to_id IS NOT NULL 
      AND (assigned_technician_ids IS NULL OR cardinality(assigned_technician_ids) = 0);
  `);

  console.log('✅ Column assigned_technician_ids created and backfilled successfully.');
  await pool.end();
}

main().catch(console.error);
