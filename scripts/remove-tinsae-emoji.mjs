import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("Checking current Tinsae user record...");
  const before = await sql.query("SELECT id, first_name, last_name, telegram_username FROM users WHERE telegram_username ILIKE 'tinsu2025' OR id = '56987a23-4574-4ab4-a0db-3104b5cf4024'");
  console.log("Before:", before);

  console.log("Cleaning 😘 emoji from Tinsae user record in Neon DB...");
  const updated = await sql.query(`
    UPDATE users 
    SET 
      first_name = TRIM(REPLACE(first_name, '😘', '')),
      last_name = TRIM(REPLACE(last_name, '😘', ''))
    WHERE id = '56987a23-4574-4ab4-a0db-3104b5cf4024' OR telegram_username ILIKE 'tinsu2025'
    RETURNING id, first_name, last_name, telegram_username
  `);
  console.log("After update:", updated);

  // If last_name is empty string, ensure it is clean
  const check = await sql.query("SELECT id, first_name, last_name, telegram_username FROM users WHERE id = '56987a23-4574-4ab4-a0db-3104b5cf4024'");
  console.log("Final check:", check[0]);
}

main().catch(console.error);
