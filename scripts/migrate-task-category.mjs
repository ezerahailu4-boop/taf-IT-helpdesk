import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Checking columns in project_tasks...');
  const check = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'project_tasks'
  `);
  console.log('Current columns:', check.rows.map(r => r.column_name));

  console.log('Adding category column if not exists...');
  await pool.query(`
    ALTER TABLE project_tasks 
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'PLANNED';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_project_tasks_category ON project_tasks(category);
  `);

  console.log('✅ Column category added and indexed successfully.');
  await pool.end();
}

main().catch(console.error);
