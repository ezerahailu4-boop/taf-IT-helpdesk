// scripts/register-telegram-webhook-and-menu.mjs
const BOT_TOKEN = '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const PUBLIC_URL = process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || 'https://observed-brothers-twin-sporting.trycloudflare.com';
const SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET || 'taf_helpdesk_secret_2026';

async function register() {
  console.log('📡 Registering Webhook & Menu Button for @tafithelpdeskbot...');

  // 1. setWebhook
  const webhookUrl = `${PUBLIC_URL}/api/telegram/webhook`;
  const hookRes = await fetch(`${BASE_URL}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: SECRET_TOKEN,
      allowed_updates: ['message', 'callback_query']
    })
  });
  const hookData = await hookRes.json();
  console.log(`✅ Webhook set:`, hookData);

  // 2. setChatMenuButton (Configures the persistent "🛠 Open IT Helpdesk" button next to chat input)
  const menuRes = await fetch(`${BASE_URL}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: '🛠 Open IT Helpdesk',
        web_app: {
          url: PUBLIC_URL
        }
      }
    })
  });
  const menuData = await menuRes.json();
  console.log(`✅ Menu Button set:`, menuData);

  // 3. getWebhookInfo
  const infoRes = await fetch(`${BASE_URL}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log(`ℹ️ Webhook Info:`, infoData.result);
}

register().catch(console.error);
