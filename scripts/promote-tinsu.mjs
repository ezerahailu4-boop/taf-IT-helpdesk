import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const BOT_TOKEN = '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const APP_URL = 'https://it-helpdesk-alpha-brown.vercel.app';

const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Connecting to Neon DB...');

  // 1. Delete placeholder user 2025001 if exists
  await pool.query(`DELETE FROM users WHERE telegram_id = '2025001'`);
  console.log('🗑️ Removed placeholder user 2025001 if existed.');

  // 2. Fetch IT department and default support group
  const itDeptRes = await pool.query(`SELECT id FROM departments WHERE name = 'IT' LIMIT 1`);
  const itDeptId = itDeptRes.rows[0]?.id;

  const sgRes = await pool.query(`SELECT id FROM support_groups LIMIT 1`);
  const defaultSgId = sgRes.rows[0]?.id;

  // 3. Promote Tinsu (telegram_id 6319536255 / username tinsu2025)
  const updateRes = await pool.query(`
    UPDATE users 
    SET 
      role = 'TECHNICIAN',
      department_id = COALESCE($1, department_id),
      support_group_id = COALESCE($2, support_group_id),
      is_registered = true,
      is_active = true,
      last_active_at = now()
    WHERE telegram_id = '6319536255' OR telegram_username ILIKE 'tinsu2025'
    RETURNING id, telegram_id, telegram_username, first_name, last_name, role, department_id, support_group_id;
  `, [itDeptId, defaultSgId]);

  console.log('✅ Tinsu updated in DB:', updateRes.rows);

  const tinsuUser = updateRes.rows[0];
  if (!tinsuUser) {
    console.error('❌ Could not find Tinsu in DB!');
    await pool.end();
    return;
  }

  // 4. Send Telegram Welcome & Activation Message to Tinsu
  const tinsuChatId = tinsuUser.telegram_id || '6319536255';
  console.log(`📤 Sending Telegram welcome to Tinsu (chat_id: ${tinsuChatId})...`);

  const welcomePayload = {
    chat_id: tinsuChatId,
    text: `👩‍💻 <b>Welcome to the IT Helpdesk Team, ${tinsuUser.first_name || 'Tinsu'}!</b>\n\n` +
          `You are officially registered as the <b>Lead Dispatcher & Technician</b>.\n\n` +
          `📌 <b>How Your Workflow Works:</b>\n` +
          `• All new employee support tickets are routed directly to you first.\n` +
          `• You can resolve them directly, or tap <b>[👤 Reassign to Tech]</b> to pass them to another technician (Daniel, Michael, Samuel, Adoni, etc.).\n\n` +
          `Tap below to open your Technician Workbench:`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '👨‍💻 Open Technician Workbench', web_app: { url: `${APP_URL}/tech` } }],
        [{ text: '🎫 View My Tickets', web_app: { url: `${APP_URL}/tickets` } }],
        [{ text: '🌐 Open in Browser', url: `${APP_URL}/tech` }]
      ]
    }
  };

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(welcomePayload)
  });

  const tgData = await tgRes.json();
  console.log('📨 Telegram send response:', tgData);

  // 5. Query all active technicians and admins to confirm system state
  const staffRes = await pool.query(`
    SELECT telegram_id, telegram_username, first_name, last_name, role 
    FROM users 
    WHERE role IN ('ADMIN', 'TECHNICIAN') AND is_active = true
    ORDER BY role, first_name;
  `);
  console.log('\n👥 Active Staff in Database:');
  console.table(staffRes.rows);

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Error executing script:', err);
  process.exit(1);
});
