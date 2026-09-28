import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  const res = await pool.query(
    "UPDATE users SET role = 'ADMIN' WHERE telegram_id = '2074368152' OR telegram_id = '10001' RETURNING id, telegram_id, first_name, role"
  );
  console.log('Promoted users to ADMIN:', res.rows);
  await pool.end();
}

main().catch(console.error);
