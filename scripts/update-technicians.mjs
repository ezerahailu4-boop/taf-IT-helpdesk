import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function main() {
  console.log('🐘 Updating technicians in Neon DB...');

  const deptRes = await pool.query(`SELECT id FROM departments WHERE name = 'IT' LIMIT 1`);
  const itDeptId = deptRes.rows[0]?.id;

  const sgRes = await pool.query(`SELECT id FROM support_groups LIMIT 1`);
  const defaultSgId = sgRes.rows[0]?.id;

  // 1. Tinsae Endashaw (@tinsu2025)
  console.log('1. Updating Tinsae Endashaw (@tinsu2025)...');
  await pool.query(`
    UPDATE users 
    SET 
      first_name = 'Tinsae',
      last_name = 'Endashaw',
      telegram_username = 'tinsu2025',
      role = 'TECHNICIAN',
      department_id = COALESCE($1, department_id),
      support_group_id = COALESCE($2, support_group_id),
      is_active = true,
      is_registered = true
    WHERE telegram_id = '6319536255' OR telegram_username ILIKE 'tinsu2025';
  `, [itDeptId, defaultSgId]);

  // 2. Matiyas Tesfaye (@Mati20)
  console.log('2. Updating/Inserting Matiyas Tesfaye (@Mati20)...');
  const matiRes = await pool.query(`SELECT id FROM users WHERE telegram_username ILIKE 'mati20'`);
  if (matiRes.rowCount > 0) {
    await pool.query(`
      UPDATE users 
      SET 
        first_name = 'Matiyas',
        last_name = 'Tesfaye',
        telegram_username = 'Mati20',
        role = 'TECHNICIAN',
        department_id = COALESCE($1, department_id),
        support_group_id = COALESCE($2, support_group_id),
        is_active = true,
        is_registered = true
      WHERE telegram_username ILIKE 'mati20'
    `, [itDeptId, defaultSgId]);
  } else {
    // Check if placeholder 1002 exists to repurpose
    const p1002 = await pool.query(`SELECT id FROM users WHERE telegram_id = '1002'`);
    if (p1002.rowCount > 0) {
      await pool.query(`
        UPDATE users 
        SET 
          first_name = 'Matiyas',
          last_name = 'Tesfaye',
          telegram_username = 'Mati20',
          role = 'TECHNICIAN',
          department_id = COALESCE($1, department_id),
          support_group_id = COALESCE($2, support_group_id),
          is_active = true,
          is_registered = true
        WHERE telegram_id = '1002'
      `, [itDeptId, defaultSgId]);
    } else {
      await pool.query(`
        INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, support_group_id, is_active, is_registered)
        VALUES ('1002', 'Mati20', 'Matiyas', 'Tesfaye', 'TECHNICIAN', $1, $2, true, true)
      `, [itDeptId, defaultSgId]);
    }
  }

  // 3. Kirubel Kassahun (@Kirabelll)
  console.log('3. Updating/Inserting Kirubel Kassahun (@Kirabelll)...');
  const kiraRes = await pool.query(`SELECT id FROM users WHERE telegram_username ILIKE 'kirabelll'`);
  if (kiraRes.rowCount > 0) {
    await pool.query(`
      UPDATE users 
      SET 
        first_name = 'Kirubel',
        last_name = 'Kassahun',
        telegram_username = 'Kirabelll',
        role = 'TECHNICIAN',
        department_id = COALESCE($1, department_id),
        support_group_id = COALESCE($2, support_group_id),
        is_active = true,
        is_registered = true
      WHERE telegram_username ILIKE 'kirabelll'
    `, [itDeptId, defaultSgId]);
  } else {
    // Check if placeholder 1003 exists to repurpose
    const p1003 = await pool.query(`SELECT id FROM users WHERE telegram_id = '1003'`);
    if (p1003.rowCount > 0) {
      await pool.query(`
        UPDATE users 
        SET 
          first_name = 'Kirubel',
          last_name = 'Kassahun',
          telegram_username = 'Kirabelll',
          role = 'TECHNICIAN',
          department_id = COALESCE($1, department_id),
          support_group_id = COALESCE($2, support_group_id),
          is_active = true,
          is_registered = true
        WHERE telegram_id = '1003'
      `, [itDeptId, defaultSgId]);
    } else {
      await pool.query(`
        INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, support_group_id, is_active, is_registered)
        VALUES ('1003', 'Kirabelll', 'Kirubel', 'Kassahun', 'TECHNICIAN', $1, $2, true, true)
      `, [itDeptId, defaultSgId]);
    }
  }

  // 4. Ibrahim Geletaw (@Ik8927)
  console.log('4. Updating Ibrahim Geletaw (@Ik8927)...');
  await pool.query(`
    UPDATE users 
    SET 
      first_name = 'Ibrahim',
      last_name = 'Geletaw',
      telegram_username = 'Ik8927',
      role = 'TECHNICIAN',
      department_id = COALESCE($1, department_id),
      support_group_id = COALESCE($2, support_group_id),
      is_active = true,
      is_registered = true
    WHERE telegram_id = '7434354672' OR telegram_username ILIKE 'ik8927';
  `, [itDeptId, defaultSgId]);

  // 5. Ezera Hailu (@Ezrsh_404)
  console.log('5. Updating Ezera Hailu (@Ezrsh_404)...');
  await pool.query(`
    UPDATE users 
    SET 
      first_name = 'Ezera',
      last_name = 'Hailu',
      telegram_username = 'Ezrsh_404',
      role = 'ADMIN',
      department_id = COALESCE($1, department_id),
      support_group_id = COALESCE($2, support_group_id),
      is_active = true,
      is_registered = true
    WHERE telegram_id = '2074368152' OR telegram_username ILIKE 'ezrsh_404';
  `, [itDeptId, defaultSgId]);

  // Deactivate old placeholder 1004 (Samuel)
  await pool.query(`UPDATE users SET is_active = false WHERE telegram_id = '1004'`);

  // Query all active technicians and admins
  const staffRes = await pool.query(`
    SELECT id, telegram_id, telegram_username, first_name, last_name, role, is_active
    FROM users 
    WHERE (role IN ('TECHNICIAN', 'ADMIN')) AND is_active = true
    ORDER BY role DESC, first_name ASC;
  `);

  console.log('\n✅ Active IT Staff / Technicians in Neon DB:');
  console.table(staffRes.rows);

  await pool.end();
}

main().catch(console.error);
