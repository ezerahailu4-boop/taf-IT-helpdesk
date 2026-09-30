import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require' });

async function checkSamuel() {
  const samuelId = '6ea1b0b6-6136-4ab4-8a5f-a6b9e6f26b10';
  const ticketsAsTech = await pool.query('SELECT count(*) FROM tickets WHERE assigned_technician_id = $1', [samuelId]);
  const ticketsAsReq = await pool.query('SELECT count(*) FROM tickets WHERE requester_id = $1', [samuelId]);
  
  console.log('Tickets as tech:', ticketsAsTech.rows[0].count);
  console.log('Tickets as req:', ticketsAsReq.rows[0].count);

  const del = await pool.query("DELETE FROM users WHERE id = $1", [samuelId]);
  console.log('Permanently deleted Samuel row count:', del.rowCount);

  await pool.end();
}

checkSamuel().catch(console.error);
