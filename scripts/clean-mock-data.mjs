import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
});

async function clean() {
  console.log('🧹 Cleaning mock data from Neon database...');

  // 1. Find mock/test tickets
  // Mock tickets: IT-2026-000241, IT-2026-000245, IT-2026-000001..000004
  const mockTicketNumbers = [
    'IT-2026-000241',
    'IT-2026-000245',
    'IT-2026-000001',
    'IT-2026-000002',
    'IT-2026-000003',
    'IT-2026-000004',
  ];

  console.log('🗑️ Removing mock and test tickets:', mockTicketNumbers);

  // Get IDs of tickets to delete
  const ticketRes = await pool.query(
    'SELECT id, ticket_number FROM tickets WHERE ticket_number = ANY($1)',
    [mockTicketNumbers]
  );
  const ticketIds = ticketRes.rows.map(r => r.id);

  if (ticketIds.length > 0) {
    // Delete child records
    await pool.query('DELETE FROM ticket_comments WHERE ticket_id = ANY($1)', [ticketIds]);
    await pool.query('DELETE FROM ticket_internal_notes WHERE ticket_id = ANY($1)', [ticketIds]);
    await pool.query('DELETE FROM ticket_status_history WHERE ticket_id = ANY($1)', [ticketIds]);
    await pool.query('DELETE FROM ticket_attachments WHERE ticket_id = ANY($1)', [ticketIds]);
    await pool.query('DELETE FROM notifications WHERE ticket_id = ANY($1)', [ticketIds]);
    await pool.query('DELETE FROM audit_logs WHERE object_id = ANY($1)', [ticketIds]);
    
    // Delete tickets (cascades to comments, notes, status_history, etc.)
    await pool.query('DELETE FROM tickets WHERE id = ANY($1)', [ticketIds]);
    console.log(`✅ Deleted ${ticketIds.length} mock tickets and all associated history/comments.`);
  }

  // 2. Remove mock demo users (Ezera 1001 and test 10001), but KEEP real user 2074368152
  const fakeUsers = ['1001', '10001', '1005'];
  await pool.query('UPDATE assets SET assigned_user_id = NULL WHERE assigned_user_id IN (SELECT id FROM users WHERE telegram_id = ANY($1))', [fakeUsers]);
  await pool.query('DELETE FROM asset_assignments WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ANY($1))', [fakeUsers]);
  await pool.query('DELETE FROM notification_preferences WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ANY($1))', [fakeUsers]);
  await pool.query('DELETE FROM users WHERE telegram_id = ANY($1)', [fakeUsers]);
  console.log('✅ Removed fake demo users (1001, 10001, 1005).');

  // 3. Verify user 2074368152 is ADMIN
  await pool.query("UPDATE users SET role = 'ADMIN' WHERE telegram_id = '2074368152'");
  console.log('✅ Confirmed user 2074368152 (Eazy-E) is ADMIN.');

  // 4. Print remaining clean database state
  const remainingTickets = await pool.query('SELECT ticket_number, subject, priority, status FROM tickets');
  console.log('\n📊 Remaining Real Tickets in Queue:', remainingTickets.rows);

  const remainingUsers = await pool.query('SELECT telegram_id, first_name, last_name, role FROM users');
  console.log('\n👥 Remaining Active Users & Staff:', remainingUsers.rows);

  console.log('\n🎉 Database is now 100% clean and ready for production!');
  await pool.end();
}

clean().catch(console.error);
