import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Migrating project_task_reports and project_task_attachments in Neon DB...');

  // 1. Add attachments column to project_task_reports if not exists
  await pool.query(`
    ALTER TABLE project_task_reports 
    ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
  `);
  console.log('✅ Added attachments column to project_task_reports');

  // 2. Create project_task_attachments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_task_attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
      report_id uuid REFERENCES project_task_reports(id) ON DELETE CASCADE,
      uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
      file_name text NOT NULL,
      file_type text NOT NULL,
      file_size integer NOT NULL,
      file_data text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_project_task_attachments_task ON project_task_attachments(task_id);
    CREATE INDEX IF NOT EXISTS idx_project_task_attachments_report ON project_task_attachments(report_id);
  `);
  console.log('✅ Created project_task_attachments table with indexes');

  // 3. Verify
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'project_task_reports'
  `);
  console.log('Updated columns in project_task_reports:', cols.rows.map(r => r.column_name));

  await pool.end();
}

main().catch(console.error);

