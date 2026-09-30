import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  const res = await pool.query("SELECT id, first_name, last_name, telegram_username, role, is_active FROM users WHERE first_name ILIKE '%samuel%' OR last_name ILIKE '%tadesse%' OR telegram_username ILIKE '%samuel%'");
  console.log('Samuel rows:', res.rows);
  const techRes = await pool.query("SELECT id, first_name, last_name, telegram_username, role, is_active FROM users WHERE role = 'TECHNICIAN' OR role = 'ADMIN'");
  console.log('All staff:', techRes.rows);
  await pool.end();
}

run().catch(console.error);
