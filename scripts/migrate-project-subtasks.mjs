import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Creating project_subtasks table in Neon DB...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_subtasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
      due_date date NOT NULL DEFAULT CURRENT_DATE,
      status text NOT NULL DEFAULT 'PENDING',
      completed_at timestamptz,
      completed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_project_subtasks_task ON project_subtasks(task_id);
    CREATE INDEX IF NOT EXISTS idx_project_subtasks_assigned ON project_subtasks(assigned_to_id);
    CREATE INDEX IF NOT EXISTS idx_project_subtasks_date ON project_subtasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_project_subtasks_status ON project_subtasks(status);
  `);

  console.log('✅ Table project_subtasks created successfully.');

  const check = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'project_subtasks'
  `);
  console.log('Columns in project_subtasks:', check.rows.map(r => r.column_name));

  await pool.end();
}

main().catch(console.error);

