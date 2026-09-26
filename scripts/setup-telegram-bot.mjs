// scripts/setup-telegram-bot.mjs
const BOT_TOKEN = '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function setup() {
  console.log('🤖 Verifying Telegram Bot...');

  // 1. getMe
  const meRes = await fetch(`${BASE_URL}/getMe`);
  const me = await meRes.json();
  if (!me.ok) {
    throw new Error(`getMe failed: ${JSON.stringify(me)}`);
  }
  console.log(`✅ Bot verified: @${me.result.username} (${me.result.first_name})`);

  // 2. setMyCommands
  const commands = [
    { command: 'start', description: 'Open IT Helpdesk Mini App' },
    { command: 'mytickets', description: 'View your support tickets' },
    { command: 'newticket', description: 'Create a new ticket' },
    { command: 'help', description: 'Help Center & Guides' },
    { command: 'support', description: 'Contact IT Support' }
  ];

  const cmdRes = await fetch(`${BASE_URL}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands })
  });
  const cmdData = await cmdRes.json();
  console.log(`✅ Bot commands registered: ${cmdData.ok}`);

  // 3. setMyDescription
  await fetch(`${BASE_URL}/setMyDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Internal IT Support & Ticketing System.\n\nOpen the Mini App to report issues, track tickets, check knowledge base articles, or manage support queues.'
    })
  });

  // 4. setMyShortDescription
  await fetch(`${BASE_URL}/setMyShortDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      short_description: 'Company IT Helpdesk & Ticketing Mini App'
    })
  });
  console.log('✅ Bot descriptions set successfully.');
}

setup().catch((e) => {
  console.error('❌ Error setting up bot:', e);
});
