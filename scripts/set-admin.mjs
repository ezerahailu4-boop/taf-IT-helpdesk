import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  await pool.query(
    "UPDATE users SET first_name = 'Ezera', last_name = 'Hailu', is_registered = true WHERE telegram_id = '2074368152'"
  );
  const res = await pool.query(
    "SELECT id, first_name, last_name, telegram_username, role, is_registered FROM users WHERE telegram_id = '2074368152'"
  );
  console.log('✅ Updated user profile:', res.rows[0]);
  await pool.end();
}

main().catch(console.error);
