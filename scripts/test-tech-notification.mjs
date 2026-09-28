import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
});

const BOT_TOKEN = '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://it-helpdesk-alpha-brown.vercel.app';

async function testNotification() {
  console.log('🧪 Testing Technician Assignment Notification...');

  // Get user 2074368152 (Eazy-E / Ezera Hailu)
  const userRes = await pool.query("SELECT * FROM users WHERE telegram_id = '2074368152'");
  const user = userRes.rows[0];

  // Get our real ticket
  const ticketRes = await pool.query("SELECT * FROM tickets LIMIT 1");
  const ticket = ticketRes.rows[0];

  if (!ticket || !user) {
    console.error('No ticket or user found to test!');
    process.exit(1);
  }

  // Simulate assigning ticket to user 2074368152 as technician
  const requesterName = `${user.first_name} ${user.last_name || ''}`.trim();
  const techText =
    `📋 <b>NEW TICKET ASSIGNED TO YOU</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 <b>Ticket:</b> <code>${ticket.ticket_number}</code>\n` +
    `📝 <b>Issue:</b> ${ticket.subject}\n` +
    `👤 <b>Requester:</b> <b>${requesterName}</b>${user.telegram_username ? ` (@${user.telegram_username})` : ''}\n` +
    `🟡 <b>Priority:</b> ${ticket.priority}\n\n` +
    `Please review and begin triage in your console.`;

  const payload = {
    chat_id: user.telegram_id,
    text: techText,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛠 Open in Tech Console', web_app: { url: `${APP_URL}/tickets/${ticket.id}` } }],
        [{ text: `💬 Chat with Requester (@${user.telegram_username})`, url: `https://t.me/${user.telegram_username}` }]
      ]
    }
  };

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('✅ Telegram API response for Technician Alert:', data);
  await pool.end();
}

testNotification().catch(console.error);
