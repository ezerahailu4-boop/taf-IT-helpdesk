/**
 * Run with: npm run set-webhook
 * Requires TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL in env.
 */
import { setWebhook, setMyCommands } from "../lib/telegram/bot";

async function main() {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET as string;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");

  const res = await setWebhook(url, secret);
  console.log("setWebhook:", res);

  const cmds = await setMyCommands();
  console.log("setMyCommands:", cmds);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
