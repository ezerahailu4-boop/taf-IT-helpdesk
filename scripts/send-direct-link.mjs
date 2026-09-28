const BOT_TOKEN = '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const CHAT_ID = '2074368152';
const URL = 'https://assist-nevertheless-licensing-protect.trycloudflare.com';

async function main() {
  const payload = {
    chat_id: CHAT_ID,
    text: `⚡ <b>IT Helpdesk Direct Links:</b>\n\n1. First close the old modal by clicking the <b>✕</b> at top-right.\n2. Tap any of the buttons below:`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛡️ Open Admin Command Center', web_app: { url: `${URL}/admin` } }],
        [{ text: '👨‍💻 Open Technician Console', web_app: { url: `${URL}/tech` } }],
        [{ text: '🌐 Open Directly in Browser', url: `${URL}/admin` }]
      ]
    }
  };

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('Result:', data);
}

main().catch(console.error);
