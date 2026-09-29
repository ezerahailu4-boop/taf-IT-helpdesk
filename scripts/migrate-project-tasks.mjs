import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Creating project_tasks and project_task_reports tables in Neon DB...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      goal text NOT NULL,
      deadline timestamptz NOT NULL,
      priority text NOT NULL DEFAULT 'MEDIUM',
      status text NOT NULL DEFAULT 'PENDING',
      progress integer NOT NULL DEFAULT 0,
      assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      completion_note text,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS project_task_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
      technician_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_text text NOT NULL,
      progress integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'IN_PROGRESS',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned ON project_tasks(assigned_to_id);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_deadline ON project_tasks(deadline);
    CREATE INDEX IF NOT EXISTS idx_project_task_reports_task ON project_task_reports(task_id);
  `);

  console.log('✅ Tables project_tasks and project_task_reports created successfully.');

  // Check if sample project task exists, if not seed a realistic IT infrastructure task
  const existing = await pool.query(`SELECT count(*) FROM project_tasks`);
  if (parseInt(existing.rows[0].count, 10) === 0) {
    console.log('🌱 Seeding initial sample project tasks...');
    const tinsaeRes = await pool.query(`SELECT id FROM users WHERE telegram_username ILIKE 'tinsu2025' LIMIT 1`);
    const matiyasRes = await pool.query(`SELECT id FROM users WHERE telegram_username ILIKE 'mati20' LIMIT 1`);
    const ezeraRes = await pool.query(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);

    const tinsaeId = tinsaeRes.rows[0]?.id;
    const matiyasId = matiyasRes.rows[0]?.id;
    const adminId = ezeraRes.rows[0]?.id;

    if (tinsaeId) {
      const task1 = await pool.query(`
        INSERT INTO project_tasks (title, goal, deadline, priority, status, progress, assigned_to_id, created_by_id)
        VALUES (
          'Deploy WPA3-Enterprise & Wi-Fi 6 APs in HQ',
          'Replace legacy access points on Floors 2 and 3 with enterprise Wi-Fi 6 APs. Configure RADIUS authentication and zero-downtime roaming for employees.',
          now() + interval '5 days',
          'HIGH',
          'IN_PROGRESS',
          40,
          $1,
          $2
        ) RETURNING id;
      `, [tinsaeId, adminId]);

      if (task1.rows[0]?.id) {
        await pool.query(`
          INSERT INTO project_task_reports (task_id, technician_id, report_text, progress, status)
          VALUES (
            $1,
            $2,
            'Floor 2 physical cabling and mounting completed. Tested signal coverage at 98% quality. Proceeding to switch VLAN tagging.',
            40,
            'IN_PROGRESS'
          );
        `, [task1.rows[0].id, tinsaeId]);
      }
    }

    if (matiyasId) {
      await pool.query(`
        INSERT INTO project_tasks (title, goal, deadline, priority, status, progress, assigned_to_id, created_by_id)
        VALUES (
          'Quarterly IT Server Room UPS Battery Test & Cable Management',
          'Perform scheduled simulated load cutover to UPS battery banks, test generator auto-start trigger, and re-bundle patch cables with velcro ties.',
          now() + interval '10 days',
          'MEDIUM',
          'PENDING',
          0,
          $1,
          $2
        );
      `, [matiyasId, adminId]);
    }

    console.log('✅ Sample project tasks seeded.');
  }

  await pool.end();
}

main().catch(console.error);
