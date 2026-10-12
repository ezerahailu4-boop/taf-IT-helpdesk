import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8921555430:AAFqSWlwNy2GRbjvAhW6M2lGKJ-75DYD4aY';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://it-helpdesk-alpha-brown.vercel.app';

async function main() {
  console.log('🔄 Transitioning completed tasks to WAITING_FOR_ADMIN and dispatching review alerts to Admins...');

  // 1. Fetch all completed tasks
  const { rows: completedTasks } = await pool.query(
    "SELECT * FROM project_tasks WHERE status = 'COMPLETED'"
  );

  console.log(`Found ${completedTasks.length} completed tasks to transition.`);

  if (completedTasks.length === 0) {
    console.log('No tasks to update.');
    await pool.end();
    return;
  }

  // 2. Fetch all active admins
  const { rows: admins } = await pool.query(
    "SELECT * FROM users WHERE role = 'ADMIN' AND is_active = true"
  );
  console.log(`Found ${admins.length} active admins:`, admins.map(a => a.telegram_username || a.first_name));

  // 3. Fetch all technicians
  const { rows: users } = await pool.query("SELECT * FROM users");
  const usersMap = new Map(users.map(u => [u.id, u]));

  for (const task of completedTasks) {
    console.log(`\nProcessing task: "${task.title}" (ID: ${task.id})`);

    // Update status to WAITING_FOR_ADMIN and progress to 90
    await pool.query(
      `UPDATE project_tasks
       SET status = 'WAITING_FOR_ADMIN',
           progress = 90,
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [task.id]
    );

    const assignedTech = task.assigned_to_id ? usersMap.get(task.assigned_to_id) : null;
    const techName = assignedTech ? `${assignedTech.first_name || 'Technician'} ${assignedTech.last_name || ''}`.trim() : 'Technician';
    const techHandle = assignedTech?.telegram_username ? `@${assignedTech.telegram_username}` : '';

    // Insert an audit report entry
    await pool.query(
      `INSERT INTO project_task_reports (task_id, technician_id, report_text, progress, status)
       VALUES ($1, $2, $3, 90, 'WAITING_FOR_ADMIN')`,
      [
        task.id,
        assignedTech ? assignedTech.id : admins[0].id,
        `[Technician Done] Fieldwork marked finished. Submitted to Admin for review (Is it completed? Yes/No).`
      ]
    );

    // Build notification text
    const text =
      `📋 <b>TASK COMPLETION REVIEW REQUESTED</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📌 <b>Task:</b> <b>${task.title}</b>\n` +
      `👨‍💻 <b>Assigned Tech:</b> ${techName} ${techHandle}\n` +
      `📊 <b>Reported Progress:</b> <b>100% (Fieldwork Done)</b>\n` +
      `🏷️ <b>Category:</b> <b>${task.category === 'UNPLANNED' ? '⚡ Unplanned' : '📅 Planned'}</b>\n\n` +
      `❓ <b>Is this task completed?</b>\n` +
      `<i>The assigned technician marked this task as finished. Admin review required — please confirm with Yes or No below:</i>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Yes, It's Completed", callback_data: `task_review:${task.id}:yes` },
          { text: "❌ No, Needs Work", callback_data: `task_review:${task.id}:no` }
        ],
        [
          { text: "🔍 Review Task & Reports", web_app: { url: `${APP_URL}/admin/tasks?taskId=${task.id}` } }
        ]
      ]
    };

    // Dispatch to admins (except if admin is the assigned tech, though admins can review any task)
    for (const admin of admins) {
      if (!admin.telegram_id) continue;
      try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: admin.telegram_id,
            text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
          })
        });
        const data = await res.json();
        if (data.ok) {
          console.log(`  ✉️ Sent review alert for "${task.title}" to Admin @${admin.telegram_username}`);
        } else {
          console.warn(`  ⚠️ Telegram response for Admin @${admin.telegram_username}:`, data.description);
        }
      } catch (err) {
        console.error(`  ❌ Failed to send alert to @${admin.telegram_username}:`, err.message);
      }
    }
  }

  console.log('\n✅ All completed tasks updated to WAITING_FOR_ADMIN with notifications sent!');
  await pool.end();
}

main().catch(console.error);
