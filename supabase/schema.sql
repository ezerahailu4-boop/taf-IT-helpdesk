-- ============================================================
-- IT Helpdesk Telegram Mini App — Database Schema (Postgres/Supabase)
-- Run this once against a fresh Supabase project (SQL Editor or `supabase db push`).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type user_role as enum ('EMPLOYEE', 'TECHNICIAN', 'ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum (
    'NEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_USER','WAITING_FOR_ADMIN',
    'RESOLVED','CLOSED','REOPENED','CANCELLED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_priority as enum ('LOW','MEDIUM','HIGH','CRITICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sla_state as enum ('ON_TRACK','AT_RISK','BREACHED','MET');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_sender_role as enum ('EMPLOYEE','TECHNICIAN','ADMIN','SYSTEM');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_status as enum ('IN_USE','IN_STORAGE','IN_REPAIR','RETIRED');
exception when duplicate_object then null; end $$;

-- ---------- CORE REFERENCE TABLES ----------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists support_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- e.g. Network Team, Hardware Team
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,           -- e.g. 'network','computer','printer'
  label text not null,                -- e.g. 'Internet / Wi-Fi'
  icon text,                          -- emoji
  default_support_group_id uuid references support_groups(id),
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ---------- USERS ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,          -- authoritative external identity
  telegram_username text,                      -- NEVER used as identifier, display only
  first_name text,
  last_name text,
  photo_url text,
  phone text,
  role user_role not null default 'EMPLOYEE',
  department_id uuid references departments(id),
  location_id uuid references locations(id),
  support_group_id uuid references support_groups(id), -- for technicians
  is_active boolean not null default true,
  language_code text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index if not exists idx_users_telegram_id on users(telegram_id);
create index if not exists idx_users_role on users(role);

-- ---------- SLA POLICIES ----------
create table if not exists sla_policies (
  id uuid primary key default gen_random_uuid(),
  priority ticket_priority not null unique,
  response_minutes int not null,
  resolution_minutes int not null,
  updated_at timestamptz not null default now()
);

insert into sla_policies (priority, response_minutes, resolution_minutes) values
  ('CRITICAL', 15, 120),
  ('HIGH', 30, 240),
  ('MEDIUM', 120, 1440),
  ('LOW', 240, 4320)
on conflict (priority) do nothing;

-- ---------- ASSETS ----------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,        -- e.g. IT-LAP-00124
  type text not null,                    -- Laptop, Printer, Router, ...
  brand text,
  model text,
  serial_number text,
  status asset_status not null default 'IN_USE',
  department_id uuid references departments(id),
  location_id uuid references locations(id),
  assigned_user_id uuid references users(id),
  warranty_expires_on date,
  created_at timestamptz not null default now()
);

create table if not exists asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  user_id uuid not null references users(id),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

create table if not exists asset_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  action text not null,
  details jsonb,
  actor_id uuid references users(id),
  created_at timestamptz not null default now()
);

-- ---------- AUTOMATION RULES ----------
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  match_category_id uuid references categories(id),
  match_priority ticket_priority,
  route_support_group_id uuid references support_groups(id),
  notify_role user_role,               -- e.g. notify ADMIN on CRITICAL
  created_at timestamptz not null default now()
);

-- ---------- TICKETS ----------
create sequence if not exists ticket_seq start 1;

create or replace function nextval_ticket_seq()
returns bigint
language sql
as $$
  select nextval('ticket_seq');
$$;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,        -- e.g. IT-2026-000245, generated in app layer
  requester_id uuid not null references users(id),
  department_id uuid references departments(id),
  category_id uuid references categories(id),
  support_group_id uuid references support_groups(id),
  subject text not null,
  description text not null,
  location_id uuid references locations(id),
  asset_id uuid references assets(id),
  priority ticket_priority not null default 'MEDIUM',
  status ticket_status not null default 'NEW',
  assigned_technician_id uuid references users(id),
  sla_policy_id uuid references sla_policies(id),
  response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  closed_at timestamptz,
  closed_by uuid references users(id),
  reopened_count int not null default 0,
  rating int check (rating >= 1 and rating <= 5),
  rating_comment text,
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tickets_requester on tickets(requester_id);
create index if not exists idx_tickets_technician on tickets(assigned_technician_id);
create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_tickets_priority on tickets(priority);
create index if not exists idx_tickets_created on tickets(created_at desc);

create table if not exists ticket_tags (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  tag text not null
);

-- Employee/technician/admin visible conversation
create table if not exists ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender_id uuid not null references users(id),
  sender_role message_sender_role not null,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_ticket on ticket_comments(ticket_id, created_at);

-- Technician/admin-only notes, never shown to employees
create table if not exists ticket_internal_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id uuid not null references users(id),
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_notes_ticket on ticket_internal_notes(ticket_id, created_at);

create table if not exists ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  comment_id uuid references ticket_comments(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  file_name text not null,
  file_type text not null,
  file_size int not null,
  storage_path text not null,      -- Supabase Storage path
  created_at timestamptz not null default now()
);

create table if not exists ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  changed_by uuid references users(id),
  from_status ticket_status,
  to_status ticket_status not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists sla_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  event_type text not null,     -- 'RESPONSE_WARNING','RESPONSE_BREACH','RESOLUTION_WARNING','RESOLUTION_BREACH','MET'
  created_at timestamptz not null default now()
);

-- ---------- KNOWLEDGE BASE ----------
create table if not exists knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  sort_order int not null default 0
);

create table if not exists knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references knowledge_categories(id),
  title text not null,
  body text not null,
  keywords text[],
  is_published boolean not null default true,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- NOTIFICATIONS ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  ticket_id uuid references tickets(id),
  type text not null,           -- 'TICKET_CREATED','TICKET_ASSIGNED', etc.
  title text not null,
  body text,
  telegram_message_id bigint,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  mute_all boolean not null default false,
  preferences jsonb not null default '{}'::jsonb
);

-- ---------- AUDIT LOG ----------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,             -- e.g. 'STATUS_CHANGE','ASSIGN','RESOLVE'
  object_type text not null,        -- 'ticket','user','asset', ...
  object_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_object on audit_logs(object_type, object_id);

-- ---------- SYSTEM SETTINGS ----------
create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into system_settings (key, value) values
  ('it_group_chat_id', 'null'),
  ('employees_can_set_critical', 'false')
on conflict (key) do nothing;

-- ---------- SEED REFERENCE DATA (safe to edit) ----------
insert into departments (name) values
  ('IT'),('Finance'),('HR'),('Sales'),('Marketing'),('Operations'),('Management')
on conflict (name) do nothing;

insert into support_groups (name, description) values
  ('Network Team','Connectivity, Wi-Fi, VPN'),
  ('Hardware Team','Laptops, desktops, printers, peripherals'),
  ('Systems Team','Accounts, passwords, access'),
  ('Application Team','Software and business applications')
on conflict (name) do nothing;

insert into categories (key,label,icon,sort_order) values
  ('network','Internet / Wi-Fi','🌐',1),
  ('computer','Computer','💻',2),
  ('printer','Printer','🖨',3),
  ('email','Email','📧',4),
  ('account','Account / Password','🔐',5),
  ('phone','Phone','📱',6),
  ('software','Software','🖥',7),
  ('other','Other','🛠',8)
on conflict (key) do nothing;

-- Route categories to default support groups
update categories set default_support_group_id = (select id from support_groups where name='Network Team') where key='network';
update categories set default_support_group_id = (select id from support_groups where name='Hardware Team') where key in ('computer','printer','phone');
update categories set default_support_group_id = (select id from support_groups where name='Systems Team') where key in ('account','email');
update categories set default_support_group_id = (select id from support_groups where name='Application Team') where key='software';

insert into knowledge_categories (name, icon, sort_order) values
  ('Network','🌐',1), ('Hardware','💻',2), ('Software','🖥',3),
  ('Email','📧',4), ('Accounts','🔐',5), ('Security','🛡',6)
on conflict (name) do nothing;

insert into knowledge_articles (category_id, title, body, keywords)
select (select id from knowledge_categories where name='Network'),
  'How to connect to company Wi-Fi',
  'Open Wi-Fi settings, select "CompanyNet", and enter your employee ID as the password. If it doesn''t connect, forget the network and try again, or contact IT.',
  array['wifi','wi-fi','internet','network']
where not exists (select 1 from knowledge_articles where title='How to connect to company Wi-Fi');

insert into knowledge_articles (category_id, title, body, keywords)
select (select id from knowledge_categories where name='Accounts'),
  'How to reset your password',
  'Go to the company login page and click "Forgot password". You''ll receive a reset link by email. If you don''t have email access, open a ticket under Account / Password.',
  array['password','reset','login','account']
where not exists (select 1 from knowledge_articles where title='How to reset your password');

insert into knowledge_articles (category_id, title, body, keywords)
select (select id from knowledge_categories where name='Email'),
  'Email setup on your phone',
  'Add your company email as an Exchange/Office 365 account in your phone''s mail app using your usual email and password. Contact IT if you''re prompted for a server address.',
  array['email','setup','mobile','outlook']
where not exists (select 1 from knowledge_articles where title='Email setup on your phone');

-- ---------- ROW LEVEL SECURITY ----------
-- The Next.js server uses the Supabase service-role key for all writes and
-- role-checked reads (see lib/auth). RLS here is a defense-in-depth backstop
-- in case the anon key is ever used directly from a client.
alter table users enable row level security;
alter table tickets enable row level security;
alter table ticket_comments enable row level security;
alter table ticket_internal_notes enable row level security;
alter table ticket_attachments enable row level security;
alter table ticket_status_history enable row level security;
alter table audit_logs enable row level security;

-- Deny all by default to the anon/public role; only the service role
-- (used exclusively server-side) bypasses RLS.
create policy "deny anon" on users for all using (false);
create policy "deny anon" on tickets for all using (false);
create policy "deny anon" on ticket_comments for all using (false);
create policy "deny anon" on ticket_internal_notes for all using (false);
create policy "deny anon" on ticket_attachments for all using (false);
create policy "deny anon" on ticket_status_history for all using (false);
create policy "deny anon" on audit_logs for all using (false);
