import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function run() {
  console.log('🐘 Connecting to Neon...');

  // 1. Add CSAT columns to tickets
  console.log('📦 Updating tickets table with CSAT columns...');
  await pool.query(`
    ALTER TABLE tickets 
    ADD COLUMN IF NOT EXISTS rating int CHECK (rating >= 1 AND rating <= 5),
    ADD COLUMN IF NOT EXISTS rating_comment text,
    ADD COLUMN IF NOT EXISTS rated_at timestamptz;
  `);
  console.log('✅ CSAT columns added to tickets table.');

  // 2. Fetch IT department and a default support group
  const deptRes = await pool.query(`SELECT id FROM departments WHERE name = 'IT' LIMIT 1`);
  const itDeptId = deptRes.rows[0]?.id;

  const sgRes = await pool.query(`SELECT id FROM support_groups LIMIT 1`);
  const defaultSgId = sgRes.rows[0]?.id;

  // 3. Promote Telegram ID 883942515 to ADMIN and assign IT / Support Group
  console.log('👤 Updating Telegram ID 883942515 to ADMIN & Technician...');
  const userRes = await pool.query(`
    UPDATE users 
    SET 
      role = 'ADMIN',
      department_id = COALESCE($1, department_id),
      support_group_id = COALESCE($2, support_group_id),
      is_active = true,
      is_registered = true,
      last_active_at = now()
    WHERE telegram_id = 883942515
    RETURNING id, telegram_id, first_name, last_name, telegram_username, role, department_id, support_group_id;
  `, [itDeptId, defaultSgId]);

  if (userRes.rowCount === 0) {
    // If not existing, insert
    const insertRes = await pool.query(`
      INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, support_group_id, is_active, is_registered)
      VALUES (883942515, 'not_adonay', 'Adoni', '', 'ADMIN', $1, $2, true, true)
      RETURNING id, telegram_id, first_name, last_name, telegram_username, role, department_id, support_group_id;
    `, [itDeptId, defaultSgId]);
    console.log('✅ Created user:', insertRes.rows[0]);
  } else {
    console.log('✅ Updated user:', userRes.rows[0]);
  }

  // Also query all admins and technicians to verify
  const allStaff = await pool.query(`
    SELECT telegram_id, first_name, last_name, telegram_username, role 
    FROM users 
    WHERE role IN ('ADMIN', 'TECHNICIAN')
  `);
  console.log('👥 Current staff members:', allStaff.rows);

  await pool.end();
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
