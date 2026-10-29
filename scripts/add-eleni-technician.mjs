import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://it-helpdesk-alpha-brown.vercel.app';

const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Connecting to Neon PostgreSQL...');

  const deptRes = await pool.query(`SELECT id FROM departments WHERE name = 'IT' LIMIT 1`);
  const itDeptId = deptRes.rows[0]?.id;

  const sgRes = await pool.query(`SELECT id FROM support_groups LIMIT 1`);
  const defaultSgId = sgRes.rows[0]?.id;

  console.log('🔍 Checking for @emushetii in database...');
  const existingRes = await pool.query(`
    SELECT id, telegram_id, telegram_username, first_name, last_name, role 
    FROM users 
    WHERE telegram_username ILIKE 'emushetii' OR telegram_id = '479917304'
  `);

  let eleniUser;

  if (existingRes.rowCount > 0) {
    console.log('Found existing user:', existingRes.rows[0]);
    const updateRes = await pool.query(`
      UPDATE users 
      SET 
        first_name = 'Eleni',
        last_name = CASE WHEN last_name IS NULL OR last_name = '' THEN 'Musheti' ELSE last_name END,
        telegram_username = 'emushetii',
        role = 'TECHNICIAN',
        department_id = COALESCE($1, department_id),
        support_group_id = COALESCE($2, support_group_id),
        is_active = true,
        is_registered = true,
        last_active_at = now()
      WHERE id = $3
      RETURNING *;
    `, [itDeptId, defaultSgId, existingRes.rows[0].id]);
    eleniUser = updateRes.rows[0];
    console.log('✅ Updated @emushetii to TECHNICIAN:', eleniUser);
  } else {
    console.log('Creating new user @emushetii...');
    const insertRes = await pool.query(`
      INSERT INTO users (
        telegram_id, telegram_username, first_name, last_name, role, department_id, support_group_id, is_active, is_registered
      )
      VALUES (
        '479917304', 'emushetii', 'Eleni', 'Musheti', 'TECHNICIAN', $1, $2, true, true
      )
      RETURNING *;
    `, [itDeptId, defaultSgId]);
    eleniUser = insertRes.rows[0];
    console.log('✅ Inserted @emushetii as TECHNICIAN:', eleniUser);
  }

  // Send Telegram notification if possible
  if (eleniUser?.telegram_id) {
    try {
      console.log(`📤 Sending Telegram notification to Eleni (ID: ${eleniUser.telegram_id})...`);
      const welcomePayload = {
        chat_id: eleniUser.telegram_id,
        text: `👩‍💻 <b>Welcome to the IT Helpdesk Team, Eleni!</b>\n\n` +
              `You have been granted <b>Technician</b> access in the TAF IT Helpdesk.\n\n` +
              `📌 <b>Your Capabilities:</b>\n` +
              `• View and accept assigned support tickets\n` +
              `• Update ticket statuses, add comments, and resolve issues\n` +
              `• Track project tasks and submit progress reports\n\n` +
              `Tap below to access your Technician Workbench:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👨‍💻 Open Technician Workbench', web_app: { url: `${APP_URL}/tech` } }],
            [{ text: '🎫 View Tickets', web_app: { url: `${APP_URL}/tickets` } }]
          ]
        }
      };

      const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(welcomePayload)
      });
      const tgData = await tgRes.json();
      console.log('Telegram API response:', tgData);
    } catch (tgErr) {
      console.error('Failed to send Telegram message:', tgErr);
    }
  }

  // Display all active technicians
  const staffRes = await pool.query(`
    SELECT id, telegram_id, telegram_username, first_name, last_name, role, is_active
    FROM users 
    WHERE role IN ('TECHNICIAN', 'ADMIN') AND is_active = true
    ORDER BY role DESC, first_name ASC;
  `);

  console.log('\n✅ Active Staff in Neon DB:');
  console.table(staffRes.rows);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
