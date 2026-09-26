// scripts/migrate-neon.mjs
import { Client } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const NEON_CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_3FHnx0GBLrdN@ep-ancient-wildflower-b445hyun-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

async function migrate() {
  console.log('🐘 Connecting to Neon PostgreSQL...');
  const client = new Client(NEON_CONNECTION_STRING);
  await client.connect();
  console.log('✅ Connected to Neon database.');

  try {
    console.log('📜 Running schema DDL on Neon...');

    // 1. Extensions & Types
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'TECHNICIAN', 'ADMIN');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ticket_status AS ENUM (
          'NEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','WAITING_FOR_ADMIN',
          'RESOLVED','CLOSED','REOPENED','CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE ticket_priority AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE sla_state AS ENUM ('ON_TRACK','AT_RISK','BREACHED','MET');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE message_sender_role AS ENUM ('EMPLOYEE','TECHNICIAN','ADMIN','SYSTEM');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE asset_status AS ENUM ('IN_USE','IN_STORAGE','IN_REPAIR','RETIRED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // 2. Reference tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key text NOT NULL UNIQUE,
        label text NOT NULL,
        icon text,
        default_support_group_id uuid REFERENCES support_groups(id),
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0
      );
    `);

    // 3. Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        telegram_id bigint NOT NULL UNIQUE,
        telegram_username text,
        first_name text,
        last_name text,
        photo_url text,
        phone text,
        role user_role NOT NULL DEFAULT 'EMPLOYEE',
        department_id uuid REFERENCES departments(id),
        location_id uuid REFERENCES locations(id),
        support_group_id uuid REFERENCES support_groups(id),
        is_active boolean NOT NULL DEFAULT true,
        language_code text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_active_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    // 4. SLA Policies
    await client.query(`
      CREATE TABLE IF NOT EXISTS sla_policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        priority ticket_priority NOT NULL UNIQUE,
        response_minutes int NOT NULL,
        resolution_minutes int NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 5. Assets
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_tag text NOT NULL UNIQUE,
        type text NOT NULL,
        brand text,
        model text,
        serial_number text,
        status asset_status NOT NULL DEFAULT 'IN_USE',
        department_id uuid REFERENCES departments(id),
        location_id uuid REFERENCES locations(id),
        assigned_user_id uuid REFERENCES users(id),
        warranty_expires_on date,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS asset_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id),
        assigned_at timestamptz NOT NULL DEFAULT now(),
        unassigned_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS asset_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        action text NOT NULL,
        details jsonb,
        actor_id uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 6. Automation Rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        match_category_id uuid REFERENCES categories(id),
        match_priority ticket_priority,
        route_support_group_id uuid REFERENCES support_groups(id),
        notify_role user_role,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 7. Sequence & Tickets
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;
      CREATE OR REPLACE FUNCTION nextval_ticket_seq()
      RETURNS bigint LANGUAGE sql AS $$ SELECT nextval('ticket_seq'); $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number text NOT NULL UNIQUE,
        requester_id uuid NOT NULL REFERENCES users(id),
        department_id uuid REFERENCES departments(id),
        category_id uuid REFERENCES categories(id),
        support_group_id uuid REFERENCES support_groups(id),
        subject text NOT NULL,
        description text NOT NULL,
        location_id uuid REFERENCES locations(id),
        asset_id uuid REFERENCES assets(id),
        priority ticket_priority NOT NULL DEFAULT 'MEDIUM',
        status ticket_status NOT NULL DEFAULT 'NEW',
        assigned_technician_id uuid REFERENCES users(id),
        sla_policy_id uuid REFERENCES sla_policies(id),
        response_due_at timestamptz,
        resolution_due_at timestamptz,
        first_responded_at timestamptz,
        resolved_at timestamptz,
        resolution_note text,
        closed_at timestamptz,
        closed_by uuid REFERENCES users(id),
        reopened_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_technician ON tickets(assigned_technician_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
      CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at desc);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        sender_id uuid NOT NULL REFERENCES users(id),
        sender_role message_sender_role NOT NULL,
        message text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id, created_at);

      CREATE TABLE IF NOT EXISTS ticket_internal_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id uuid NOT NULL REFERENCES users(id),
        note text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notes_ticket ON ticket_internal_notes(ticket_id, created_at);

      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        comment_id uuid REFERENCES ticket_comments(id) ON DELETE CASCADE,
        uploaded_by uuid NOT NULL REFERENCES users(id),
        file_name text NOT NULL,
        file_type text NOT NULL,
        file_size int NOT NULL,
        storage_path text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ticket_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        changed_by uuid REFERENCES users(id),
        from_status ticket_status,
        to_status ticket_status NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sla_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 8. Knowledge Base
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        icon text,
        sort_order int NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS knowledge_articles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id uuid REFERENCES knowledge_categories(id),
        title text NOT NULL,
        body text NOT NULL,
        keywords text[],
        is_published boolean NOT NULL DEFAULT true,
        view_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 9. Notifications, Preferences, Audit, Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        ticket_id uuid REFERENCES tickets(id),
        type text NOT NULL,
        title text NOT NULL,
        body text,
        telegram_message_id bigint,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        mute_all boolean NOT NULL DEFAULT false,
        preferences jsonb NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid REFERENCES users(id),
        action text NOT NULL,
        object_type text NOT NULL,
        object_id uuid,
        previous_value jsonb,
        new_value jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_logs(object_type, object_id);

      CREATE TABLE IF NOT EXISTS system_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 10. Default Seed Data
    console.log('🌱 Seeding initial reference data into Neon...');

    await client.query(`
      INSERT INTO sla_policies (priority, response_minutes, resolution_minutes) VALUES
        ('CRITICAL', 15, 120),
        ('HIGH', 30, 240),
        ('MEDIUM', 120, 1440),
        ('LOW', 240, 4320)
      ON CONFLICT (priority) DO NOTHING;

      INSERT INTO departments (name) VALUES
        ('IT'),('Finance'),('HR'),('Sales'),('Marketing'),('Operations'),('Management')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO locations (name) VALUES
        ('Head Office'),('Building B'),('Regional Hub'),('Remote')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO support_groups (name, description) VALUES
        ('Network Team','Connectivity, Wi-Fi, VPN'),
        ('Hardware Team','Laptops, desktops, printers, peripherals'),
        ('Systems Team','Accounts, passwords, access'),
        ('Application Team','Software and business applications')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO categories (key, label, icon, sort_order) VALUES
        ('network','Internet / Wi-Fi','🌐',1),
        ('computer','Computer','💻',2),
        ('printer','Printer','🖨',3),
        ('email','Email','📧',4),
        ('account','Account / Password','🔐',5),
        ('phone','Phone','📱',6),
        ('software','Software','🖥',7),
        ('other','Other','🛠',8)
      ON CONFLICT (key) DO NOTHING;

      UPDATE categories SET default_support_group_id = (SELECT id FROM support_groups WHERE name='Network Team') WHERE key='network';
      UPDATE categories SET default_support_group_id = (SELECT id FROM support_groups WHERE name='Hardware Team') WHERE key in ('computer','printer','phone');
      UPDATE categories SET default_support_group_id = (SELECT id FROM support_groups WHERE name='Systems Team') WHERE key in ('account','email');
      UPDATE categories SET default_support_group_id = (SELECT id FROM support_groups WHERE name='Application Team') WHERE key='software';

      INSERT INTO knowledge_categories (name, icon, sort_order) VALUES
        ('Network','🌐',1), ('Hardware','💻',2), ('Software','🖥',3),
        ('Email','📧',4), ('Accounts','🔐',5), ('Security','🛡',6)
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO system_settings (key, value) VALUES
        ('it_group_chat_id', 'null'),
        ('employees_can_set_critical', 'false')
      ON CONFLICT (key) DO NOTHING;
    `);

    // 11. Seed Users (Ezera, Daniel, Michael, Samuel, Sarah)
    console.log('👤 Seeding default users into Neon...');
    await client.query(`
      INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, location_id)
      SELECT 1001, 'ezera_h', 'Ezera', 'Hailu', 'EMPLOYEE',
             (SELECT id FROM departments WHERE name='Finance' LIMIT 1),
             (SELECT id FROM locations WHERE name='Head Office' LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = 1001);

      INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, location_id, support_group_id)
      SELECT 1002, 'daniel_it', 'Daniel', 'Worku', 'TECHNICIAN',
             (SELECT id FROM departments WHERE name='IT' LIMIT 1),
             (SELECT id FROM locations WHERE name='Head Office' LIMIT 1),
             (SELECT id FROM support_groups WHERE name='Network Team' LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = 1002);

      INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, location_id, support_group_id)
      SELECT 1003, 'michael_chen', 'Michael', 'Chen', 'TECHNICIAN',
             (SELECT id FROM departments WHERE name='IT' LIMIT 1),
             (SELECT id FROM locations WHERE name='Building B' LIMIT 1),
             (SELECT id FROM support_groups WHERE name='Hardware Team' LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = 1003);

      INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, location_id, support_group_id)
      SELECT 1004, 'samuel_t', 'Samuel', 'Tadesse', 'TECHNICIAN',
             (SELECT id FROM departments WHERE name='IT' LIMIT 1),
             (SELECT id FROM locations WHERE name='Head Office' LIMIT 1),
             (SELECT id FROM support_groups WHERE name='Systems Team' LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = 1004);

      INSERT INTO users (telegram_id, telegram_username, first_name, last_name, role, department_id, location_id)
      SELECT 1005, 'sarah_admin', 'Sarah', 'Connor', 'ADMIN',
             (SELECT id FROM departments WHERE name='IT' LIMIT 1),
             (SELECT id FROM locations WHERE name='Head Office' LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = 1005);
    `);

    // 12. Seed Assets
    console.log('💻 Seeding hardware assets into Neon...');
    await client.query(`
      INSERT INTO assets (asset_tag, type, brand, model, serial_number, status, department_id, location_id, assigned_user_id, warranty_expires_on)
      SELECT 'IT-LAP-00124', 'Laptop', 'Dell', 'Latitude 5440', 'DL-5440-9821X', 'IN_USE',
             (SELECT id FROM departments WHERE name='Finance' LIMIT 1),
             (SELECT id FROM locations WHERE name='Head Office' LIMIT 1),
             (SELECT id FROM users WHERE telegram_id = 1001 LIMIT 1),
             '2027-12-31'
      WHERE NOT EXISTS (SELECT 1 FROM assets WHERE asset_tag = 'IT-LAP-00124');

      INSERT INTO assets (asset_tag, type, brand, model, serial_number, status, department_id, location_id, warranty_expires_on)
      SELECT 'IT-PRN-00045', 'Printer', 'HP', 'LaserJet Pro MFP 4101', 'HP-4101-5529A', 'IN_USE',
             (SELECT id FROM departments WHERE name='IT' LIMIT 1),
             (SELECT id FROM locations WHERE name='Building B' LIMIT 1),
             '2026-06-30'
      WHERE NOT EXISTS (SELECT 1 FROM assets WHERE asset_tag = 'IT-PRN-00045');

      INSERT INTO assets (asset_tag, type, brand, model, serial_number, status, department_id, location_id, warranty_expires_on)
      SELECT 'IT-SVR-00003', 'Server', 'Dell', 'PowerEdge R750', 'PE-R750-7712Q', 'IN_USE',
             (SELECT id FROM departments WHERE name='IT' LIMIT 1),
             (SELECT id FROM locations WHERE name='Head Office' LIMIT 1),
             '2028-09-15'
      WHERE NOT EXISTS (SELECT 1 FROM assets WHERE asset_tag = 'IT-SVR-00003');
    `);

    // 13. Seed Knowledge Articles
    console.log('📚 Seeding knowledge base into Neon...');
    await client.query(`
      INSERT INTO knowledge_articles (category_id, title, body, keywords)
      SELECT (SELECT id FROM knowledge_categories WHERE name='Network' LIMIT 1),
        'How to connect to company Wi-Fi',
        'Open Wi-Fi settings, select "CompanyNet", and enter your employee ID as the password. If it does not connect, forget the network and try again, or contact IT.',
        ARRAY['wifi','wi-fi','internet','network']
      WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title='How to connect to company Wi-Fi');

      INSERT INTO knowledge_articles (category_id, title, body, keywords)
      SELECT (SELECT id FROM knowledge_categories WHERE name='Accounts' LIMIT 1),
        'How to reset your password',
        'Go to the company login page and click "Forgot password". You will receive a reset link by email. If you do not have email access, open a ticket under Account / Password.',
        ARRAY['password','reset','login','account']
      WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title='How to reset your password');

      INSERT INTO knowledge_articles (category_id, title, body, keywords)
      SELECT (SELECT id FROM knowledge_categories WHERE name='Email' LIMIT 1),
        'Email setup on your phone',
        'Add your company email as an Exchange/Office 365 account in your phones mail app using your usual email and password. Contact IT if you are prompted for a server address.',
        ARRAY['email','setup','mobile','outlook']
      WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title='Email setup on your phone');
    `);

    // 14. Seed Initial Tickets
    console.log('🎫 Seeding initial tickets into Neon...');
    await client.query(`
      INSERT INTO tickets (ticket_number, requester_id, department_id, category_id, support_group_id, subject, description, priority, status, assigned_technician_id)
      SELECT 'IT-2026-000241',
             (SELECT id FROM users WHERE telegram_id = 1001 LIMIT 1),
             (SELECT id FROM departments WHERE name='Finance' LIMIT 1),
             (SELECT id FROM categories WHERE key='computer' LIMIT 1),
             (SELECT id FROM support_groups WHERE name='Hardware Team' LIMIT 1),
             'Primary ERP Server unavailable during month-end close',
             'The central finance database server is refusing connections with timeout error 504. Multiple finance teams unable to close books.',
             'CRITICAL',
             'IN_PROGRESS',
             (SELECT id FROM users WHERE telegram_id = 1002 LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE ticket_number = 'IT-2026-000241');

      INSERT INTO tickets (ticket_number, requester_id, department_id, category_id, support_group_id, subject, description, priority, status, assigned_technician_id)
      SELECT 'IT-2026-000245',
             (SELECT id FROM users WHERE telegram_id = 1001 LIMIT 1),
             (SELECT id FROM departments WHERE name='Finance' LIMIT 1),
             (SELECT id FROM categories WHERE key='network' LIMIT 1),
             (SELECT id FROM support_groups WHERE name='Network Team' LIMIT 1),
             'Head Office Wi-Fi coverage intermittent on 3rd floor',
             'Laptops in conference room B keep dropping from CompanyNet SSID.',
             'HIGH',
             'IN_PROGRESS',
             (SELECT id FROM users WHERE telegram_id = 1002 LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE ticket_number = 'IT-2026-000245');
    `);

    console.log('\n=============================================================');
    console.log('🎉 NEON DATABASE SCHEMA & SEED DATA MIGRATION COMPLETE!');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
