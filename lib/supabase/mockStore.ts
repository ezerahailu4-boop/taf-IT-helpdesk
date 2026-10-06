// In-memory persistent mock database for development and testing when Supabase is not yet connected.
// Implements the subset of SupabaseClient methods used by the application.
import type { DbUser, DbTicket, TicketPriority, TicketStatus, UserRole } from "@/types/db";

export interface MockDepartment {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface MockLocation {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface MockSupportGroup {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface MockCategory {
  id: string;
  key: string;
  label: string;
  icon: string;
  default_support_group_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface MockAsset {
  id: string;
  asset_tag: string;
  type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: "IN_USE" | "IN_STORAGE" | "IN_REPAIR" | "RETIRED";
  department_id: string | null;
  location_id: string | null;
  assigned_user_id: string | null;
  warranty_expires_on: string | null;
  created_at: string;
}

export interface MockSlaPolicy {
  id: string;
  priority: TicketPriority;
  response_minutes: number;
  resolution_minutes: number;
  updated_at: string;
}

export interface MockAutomationRule {
  id: string;
  name: string;
  is_active: boolean;
  match_category_id: string | null;
  match_priority: TicketPriority | null;
  route_support_group_id: string | null;
  notify_role: UserRole | null;
  created_at: string;
}

export interface MockKnowledgeArticle {
  id: string;
  category_id: string | null;
  category_name?: string;
  title: string;
  body: string;
  keywords: string[];
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface MockAuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  previous_value: any;
  new_value: any;
  created_at: string;
}

export interface MockTicketComment {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: "EMPLOYEE" | "TECHNICIAN" | "ADMIN" | "SYSTEM";
  message: string;
  created_at: string;
}

export interface MockTicketInternalNote {
  id: string;
  ticket_id: string;
  author_id: string;
  note: string;
  created_at: string;
}

export interface MockTicketStatusHistory {
  id: string;
  ticket_id: string;
  changed_by: string | null;
  from_status: TicketStatus | null;
  to_status: TicketStatus;
  note: string | null;
  created_at: string;
}

export interface MockTicketAttachment {
  id: string;
  ticket_id: string;
  comment_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

// Global state container attached to globalThis to survive Next.js Fast Refresh
interface MockDbStore {
  users: DbUser[];
  departments: MockDepartment[];
  locations: MockLocation[];
  support_groups: MockSupportGroup[];
  categories: MockCategory[];
  assets: MockAsset[];
  sla_policies: MockSlaPolicy[];
  automation_rules: MockAutomationRule[];
  knowledge_articles: MockKnowledgeArticle[];
  tickets: DbTicket[];
  ticket_comments: MockTicketComment[];
  ticket_internal_notes: MockTicketInternalNote[];
  ticket_status_history: MockTicketStatusHistory[];
  ticket_attachments: MockTicketAttachment[];
  audit_logs: MockAuditLog[];
  project_tasks: any[];
  project_task_reports: any[];
  system_settings: { key: string; value: any; updated_at?: string }[];
  sla_events: { id: string; ticket_id: string; event_type: string; created_at: string }[];
  ticket_seq: number;
}

const GLOBAL_KEY = "__IT_HELPDESK_MOCK_DB__";

function seedData(): MockDbStore {
  const deptFinance = "dept-1111-1111";
  const deptIT = "dept-2222-2222";
  const deptHR = "dept-3333-3333";
  const deptSales = "dept-4444-4444";
  const deptOps = "dept-5555-5555";

  const locHeadOffice = "loc-1111-1111";
  const locBuildingB = "loc-2222-2222";
  const locRegional = "loc-3333-3333";
  const locRemote = "loc-4444-4444";

  const sgNetwork = "sg-1111-1111";
  const sgHardware = "sg-2222-2222";
  const sgSystems = "sg-3333-3333";
  const sgApps = "sg-4444-4444";

  const userEmployeeId = "user-employee-ezera";
  const userTechDanielId = "user-tech-daniel";
  const userTechMichaelId = "user-tech-michael";
  const userTechIbrahimId = "user-tech-ibrahim";
  const userAdminSarahId = "user-admin-sarah";

  const catNetwork = "cat-network";
  const catComputer = "cat-computer";
  const catPrinter = "cat-printer";
  const catEmail = "cat-email";
  const catAccount = "cat-account";
  const catPhone = "cat-phone";
  const catSoftware = "cat-software";
  const catOther = "cat-other";

  const assetLaptop = "asset-laptop-01";
  const assetPrinter = "asset-printer-01";
  const assetServer = "asset-server-01";

  const now = new Date();
  const isoNow = now.toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

  return {
    ticket_seq: 246,
    users: [
      {
        id: userEmployeeId,
        telegram_id: 1001,
        telegram_username: "abebe_k",
        first_name: "Abebe",
        last_name: "Kebede",
        photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        phone: "+251 91 123 4567",
        role: "EMPLOYEE",
        department_id: deptFinance,
        location_id: locHeadOffice,
        support_group_id: null,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: "user-tech-tinsae",
        telegram_id: 6319536255,
        telegram_username: "tinsu2025",
        first_name: "Tinsae",
        last_name: "Endashaw",
        photo_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
        phone: "+251 92 000 0001",
        role: "TECHNICIAN",
        department_id: deptIT,
        location_id: locHeadOffice,
        support_group_id: sgNetwork,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: userTechDanielId,
        telegram_id: 1002,
        telegram_username: "Mati20",
        first_name: "Matiyas",
        last_name: "Tesfaye",
        photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
        phone: "+251 92 000 0002",
        role: "TECHNICIAN",
        department_id: deptIT,
        location_id: locHeadOffice,
        support_group_id: sgNetwork,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: userTechMichaelId,
        telegram_id: 1003,
        telegram_username: "Kirabelll",
        first_name: "Kirubel",
        last_name: "Kassahun",
        photo_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
        phone: "+251 92 000 0003",
        role: "TECHNICIAN",
        department_id: deptIT,
        location_id: locBuildingB,
        support_group_id: sgHardware,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: userTechIbrahimId,
        telegram_id: 7434354672,
        telegram_username: "Ik8927",
        first_name: "Ibrahim",
        last_name: "Geletaw",
        photo_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
        phone: "+251 92 000 0004",
        role: "TECHNICIAN",
        department_id: deptIT,
        location_id: locHeadOffice,
        support_group_id: sgSystems,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: "user-admin-ezera",
        telegram_id: 2074368152,
        telegram_username: "Ezrsh_404",
        first_name: "Ezera",
        last_name: "Hailu",
        photo_url: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
        phone: "+251 92 000 0005",
        role: "ADMIN",
        department_id: deptIT,
        location_id: locHeadOffice,
        support_group_id: sgNetwork,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: "user-admin-adoni",
        telegram_id: 883942515,
        telegram_username: "not_adonay",
        first_name: "Adoni",
        last_name: "",
        photo_url: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80",
        phone: "+251 92 000 0006",
        role: "ADMIN",
        department_id: deptIT,
        location_id: locHeadOffice,
        support_group_id: sgNetwork,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      },
      {
        id: "user-admin-kalkidan",
        telegram_id: 205797800,
        telegram_username: "kalkidangebyehu",
        first_name: "Kalkidan",
        last_name: "Gebeyehu",
        photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        phone: "+251 91 000 0007",
        role: "ADMIN",
        department_id: deptIT,
        location_id: locHeadOffice,
        support_group_id: sgNetwork,
        is_active: true,
        created_at: oneDayAgo,
        last_active_at: isoNow
      }
    ],
    departments: [
      { id: deptIT, name: "IT", is_active: true, created_at: oneDayAgo },
      { id: deptFinance, name: "Finance", is_active: true, created_at: oneDayAgo },
      { id: deptHR, name: "HR", is_active: true, created_at: oneDayAgo },
      { id: deptSales, name: "Sales", is_active: true, created_at: oneDayAgo },
      { id: deptOps, name: "Operations", is_active: true, created_at: oneDayAgo },
      { id: "dept-6666-6666", name: "Marketing", is_active: true, created_at: oneDayAgo },
      { id: "dept-7777-7777", name: "Management", is_active: true, created_at: oneDayAgo }
    ],
    locations: [
      { id: locHeadOffice, name: "Head Office", is_active: true, created_at: oneDayAgo },
      { id: locBuildingB, name: "Building B - Floor 2", is_active: true, created_at: oneDayAgo },
      { id: locRegional, name: "Regional Hub", is_active: true, created_at: oneDayAgo },
      { id: locRemote, name: "Remote", is_active: true, created_at: oneDayAgo }
    ],
    support_groups: [
      { id: sgNetwork, name: "Network Team", description: "Wi-Fi, switches, routers, VPN & firewall support", is_active: true, created_at: oneDayAgo },
      { id: sgHardware, name: "Hardware Team", description: "Laptops, monitors, printers, peripherals", is_active: true, created_at: oneDayAgo },
      { id: sgSystems, name: "Systems Team", description: "Active Directory, servers, IAM, permissions", is_active: true, created_at: oneDayAgo },
      { id: sgApps, name: "Application Team", description: "Internal business software, ERP, SaaS", is_active: true, created_at: oneDayAgo }
    ],
    categories: [
      { id: catNetwork, key: "network", label: "Internet / Wi-Fi", icon: "🌐", default_support_group_id: sgNetwork, is_active: true, sort_order: 1 },
      { id: catComputer, key: "computer", label: "Computer / Laptop", icon: "💻", default_support_group_id: sgHardware, is_active: true, sort_order: 2 },
      { id: catPrinter, key: "printer", label: "Printer", icon: "🖨", default_support_group_id: sgHardware, is_active: true, sort_order: 3 },
      { id: catEmail, key: "email", label: "Email / Outlook", icon: "📧", default_support_group_id: sgSystems, is_active: true, sort_order: 4 },
      { id: catAccount, key: "account", label: "Account / Password", icon: "🔐", default_support_group_id: sgSystems, is_active: true, sort_order: 5 },
      { id: catPhone, key: "phone", label: "Phone / Mobile", icon: "📱", default_support_group_id: sgHardware, is_active: true, sort_order: 6 },
      { id: catSoftware, key: "software", label: "Software / Apps", icon: "🖥", default_support_group_id: sgApps, is_active: true, sort_order: 7 },
      { id: catOther, key: "other", label: "Other Inquiry", icon: "🛠", default_support_group_id: null, is_active: true, sort_order: 8 }
    ],
    assets: [
      {
        id: assetLaptop,
        asset_tag: "IT-LAP-00124",
        type: "Laptop",
        brand: "Dell",
        model: "Latitude 5440",
        serial_number: "DL-5440-9821X",
        status: "IN_USE",
        department_id: deptFinance,
        location_id: locHeadOffice,
        assigned_user_id: userEmployeeId,
        warranty_expires_on: "2027-12-31",
        created_at: oneDayAgo
      },
      {
        id: assetPrinter,
        asset_tag: "IT-PRN-00045",
        type: "Printer",
        brand: "HP",
        model: "LaserJet Pro MFP 4101",
        serial_number: "HP-4101-5529A",
        status: "IN_USE",
        department_id: deptIT,
        location_id: locBuildingB,
        assigned_user_id: null,
        warranty_expires_on: "2026-06-30",
        created_at: oneDayAgo
      },
      {
        id: assetServer,
        asset_tag: "IT-SVR-00003",
        type: "Server",
        brand: "Dell",
        model: "PowerEdge R750",
        serial_number: "PE-R750-7712Q",
        status: "IN_USE",
        department_id: deptIT,
        location_id: locHeadOffice,
        assigned_user_id: null,
        warranty_expires_on: "2028-09-15",
        created_at: oneDayAgo
      },
      {
        id: "asset-phone-01",
        asset_tag: "IT-PHN-00088",
        type: "Phone",
        brand: "Apple",
        model: "iPhone 15 Pro",
        serial_number: "F2LX9201MD",
        status: "IN_USE",
        department_id: deptFinance,
        location_id: locHeadOffice,
        assigned_user_id: userEmployeeId,
        warranty_expires_on: "2026-11-20",
        created_at: oneDayAgo
      }
    ],
    sla_policies: [
      { id: "sla-crit", priority: "CRITICAL", response_minutes: 15, resolution_minutes: 120, updated_at: isoNow },
      { id: "sla-high", priority: "HIGH", response_minutes: 30, resolution_minutes: 240, updated_at: isoNow },
      { id: "sla-med", priority: "MEDIUM", response_minutes: 120, resolution_minutes: 1440, updated_at: isoNow },
      { id: "sla-low", priority: "LOW", response_minutes: 240, resolution_minutes: 4320, updated_at: isoNow }
    ],
    automation_rules: [
      { id: "ar-1", name: "Network ticket -> Network Team", is_active: true, match_category_id: catNetwork, match_priority: null, route_support_group_id: sgNetwork, notify_role: null, created_at: oneDayAgo },
      { id: "ar-2", name: "Printer ticket -> Hardware Team", is_active: true, match_category_id: catPrinter, match_priority: null, route_support_group_id: sgHardware, notify_role: null, created_at: oneDayAgo },
      { id: "ar-3", name: "Account ticket -> Systems Team", is_active: true, match_category_id: catAccount, match_priority: null, route_support_group_id: sgSystems, notify_role: null, created_at: oneDayAgo },
      { id: "ar-4", name: "Critical ticket -> Alert Admin", is_active: true, match_category_id: null, match_priority: "CRITICAL", route_support_group_id: null, notify_role: "ADMIN", created_at: oneDayAgo }
    ],
    knowledge_articles: [
      {
        id: "art-1",
        category_id: catNetwork,
        category_name: "Internet / Wi-Fi",
        title: "How to connect to company Wi-Fi (Corp-Secure)",
        body: "1. Select 'Corp-Secure' from your Wi-Fi list.\n2. In the authentication prompt, enter your corporate email username and password.\n3. Accept the certificate issued by 'internal-ca.company.com'.\n4. If prompted, select WPA2/WPA3 Enterprise (PEAP / MSCHAPv2).\n5. Need help? Please submit a ticket with your MAC address.",
        keywords: ["wifi", "wi-fi", "internet", "network", "connect", "wireless", "corp-secure"],
        is_published: true,
        view_count: 342,
        created_at: oneDayAgo,
        updated_at: oneDayAgo
      },
      {
        id: "art-2",
        category_id: catAccount,
        category_name: "Account / Password",
        title: "How to reset your corporate password",
        body: "You can self-service reset your password from https://password.company.com.\n\nRequirements:\n- Must be at least 14 characters.\n- Must contain uppercase, lowercase, numbers, and symbols.\n- Cannot be any of your last 10 passwords.\n\nIf your account is locked out after 5 invalid attempts, wait 15 minutes or submit an Account ticket.",
        keywords: ["password", "reset", "locked", "account", "login", "credentials"],
        is_published: true,
        view_count: 512,
        created_at: oneDayAgo,
        updated_at: oneDayAgo
      },
      {
        id: "art-3",
        category_id: catEmail,
        category_name: "Email / Outlook",
        title: "How to configure email on mobile and desktop",
        body: "Desktop:\nOpen Outlook, enter your work email, and authenticate with Microsoft Authenticator MFA.\n\nMobile (iOS/Android):\n1. Download Microsoft Outlook from the App Store or Play Store.\n2. Enter your full work email address.\n3. Complete the MFA approval.\n4. Accept corporate device compliance prompts.",
        keywords: ["email", "outlook", "mail", "phone", "setup", "mobile"],
        is_published: true,
        view_count: 220,
        created_at: oneDayAgo,
        updated_at: oneDayAgo
      },
      {
        id: "art-4",
        category_id: catSoftware,
        category_name: "Software / Apps",
        title: "How to request software licenses and installations",
        body: "All corporate software requests require manager approval.\n1. Check Company Self-Service Portal for pre-approved software.\n2. For paid licenses (e.g. Figma, Adobe CC, JetBrains), create a ticket with category 'Software / Apps'.\n3. Include cost center code and manager name in description.",
        keywords: ["software", "license", "figma", "adobe", "install", "app"],
        is_published: true,
        view_count: 145,
        created_at: oneDayAgo,
        updated_at: oneDayAgo
      }
    ],
    tickets: [
      {
        id: "ticket-241",
        ticket_number: "IT-2026-000241",
        requester_id: userEmployeeId,
        department_id: deptIT,
        category_id: catNetwork,
        support_group_id: sgNetwork,
        subject: "Production database server cluster unreachable",
        description: "Postgres primary node reports connection refused on port 5432. All internal apps experiencing downtime.",
        location_id: locHeadOffice,
        asset_id: assetServer,
        priority: "CRITICAL",
        status: "IN_PROGRESS",
        assigned_technician_id: userTechDanielId,
        sla_policy_id: "sla-crit",
        response_due_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
        resolution_due_at: new Date(now.getTime() + 45 * 60_000).toISOString(),
        first_responded_at: twoHoursAgo,
        resolved_at: null,
        resolution_note: null,
        closed_at: null,
        closed_by: null,
        reopened_count: 0,
        created_at: twoHoursAgo,
        updated_at: twoHoursAgo
      },
      {
        id: "ticket-245",
        ticket_number: "IT-2026-000245",
        requester_id: userEmployeeId,
        department_id: deptFinance,
        category_id: catNetwork,
        support_group_id: sgNetwork,
        subject: "Wi-Fi is not working on laptop",
        description: "My Dell Latitude laptop cannot connect to Corp-Secure Wi-Fi. Keeps saying 'Can't connect to this network'.",
        location_id: locHeadOffice,
        asset_id: assetLaptop,
        priority: "HIGH",
        status: "IN_PROGRESS",
        assigned_technician_id: userTechDanielId,
        sla_policy_id: "sla-high",
        response_due_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
        resolution_due_at: new Date(now.getTime() + 105 * 60_000).toISOString(),
        first_responded_at: new Date(now.getTime() - 20 * 60_000).toISOString(),
        resolved_at: null,
        resolution_note: null,
        closed_at: null,
        closed_by: null,
        reopened_count: 0,
        created_at: new Date(now.getTime() - 40 * 60_000).toISOString(),
        updated_at: new Date(now.getTime() - 20 * 60_000).toISOString()
      },
      {
        id: "ticket-124",
        ticket_number: "IT-2026-000124",
        requester_id: userEmployeeId,
        department_id: deptFinance,
        category_id: catComputer,
        support_group_id: sgHardware,
        subject: "Laptop battery draining abnormally fast",
        description: "Battery discharges from 100% to 0% in under 45 minutes even on power saver mode.",
        location_id: locHeadOffice,
        asset_id: assetLaptop,
        priority: "MEDIUM",
        status: "ASSIGNED",
        assigned_technician_id: userTechMichaelId,
        sla_policy_id: "sla-med",
        response_due_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
        resolution_due_at: new Date(now.getTime() + 600 * 60_000).toISOString(),
        first_responded_at: null,
        resolved_at: null,
        resolution_note: null,
        closed_at: null,
        closed_by: null,
        reopened_count: 0,
        created_at: new Date(now.getTime() - 90 * 60_000).toISOString(),
        updated_at: new Date(now.getTime() - 90 * 60_000).toISOString()
      },
      {
        id: "ticket-118",
        ticket_number: "IT-2026-000118",
        requester_id: userEmployeeId,
        department_id: deptFinance,
        category_id: catPrinter,
        support_group_id: sgHardware,
        subject: "Printer paper jam in 2nd floor copier",
        description: "Tray 2 has a continuous paper jam error and red warning indicator.",
        location_id: locBuildingB,
        asset_id: assetPrinter,
        priority: "LOW",
        status: "RESOLVED",
        assigned_technician_id: userTechMichaelId,
        sla_policy_id: "sla-low",
        response_due_at: oneDayAgo,
        resolution_due_at: isoNow,
        first_responded_at: oneDayAgo,
        resolved_at: new Date(now.getTime() - 3 * 3600_000).toISOString(),
        resolution_note: "Roller was misaligned and cleared stuck shredded sheet. Tested 10 double-sided print copies successfully.",
        closed_at: null,
        closed_by: null,
        reopened_count: 0,
        created_at: oneDayAgo,
        updated_at: new Date(now.getTime() - 3 * 3600_000).toISOString()
      }
    ],
    ticket_comments: [
      {
        id: "comm-1",
        ticket_id: "ticket-245",
        sender_id: userEmployeeId,
        sender_role: "EMPLOYEE",
        message: "My laptop cannot connect to Wi-Fi even after rebooting.",
        created_at: new Date(now.getTime() - 38 * 60_000).toISOString()
      },
      {
        id: "comm-2",
        ticket_id: "ticket-245",
        sender_id: userTechDanielId,
        sender_role: "TECHNICIAN",
        message: "Hi Ezera, I'm checking the connection now from the wireless controller.",
        created_at: new Date(now.getTime() - 20 * 60_000).toISOString()
      }
    ],
    ticket_internal_notes: [
      {
        id: "note-1",
        ticket_id: "ticket-245",
        author_id: userTechDanielId,
        note: "Access point AP-FL2-04 dropped 3 other clients around 09:20. Firmware bug suspected.",
        created_at: new Date(now.getTime() - 18 * 60_000).toISOString()
      }
    ],
    ticket_status_history: [
      { id: "sh-1", ticket_id: "ticket-245", changed_by: userEmployeeId, from_status: null, to_status: "NEW", note: "Ticket created", created_at: new Date(now.getTime() - 40 * 60_000).toISOString() },
      { id: "sh-2", ticket_id: "ticket-245", changed_by: userTechDanielId, from_status: "NEW", to_status: "ASSIGNED", note: "Assigned to Daniel", created_at: new Date(now.getTime() - 25 * 60_000).toISOString() },
      { id: "sh-3", ticket_id: "ticket-245", changed_by: userTechDanielId, from_status: "ASSIGNED", to_status: "IN_PROGRESS", note: "Investigating AP switch port", created_at: new Date(now.getTime() - 20 * 60_000).toISOString() }
    ],
    ticket_attachments: [],
    audit_logs: [
      {
        id: "audit-1",
        actor_id: userEmployeeId,
        action: "CREATE",
        object_type: "ticket",
        object_id: "ticket-245",
        previous_value: null,
        new_value: { subject: "Wi-Fi is not working on laptop", priority: "HIGH" },
        created_at: new Date(now.getTime() - 40 * 60_000).toISOString()
      },
      {
        id: "audit-2",
        actor_id: userTechDanielId,
        action: "TAKE",
        object_type: "ticket",
        object_id: "ticket-245",
        previous_value: { assigned_technician_id: null },
        new_value: { assigned_technician_id: userTechDanielId },
        created_at: new Date(now.getTime() - 25 * 60_000).toISOString()
      }
    ],
    system_settings: [
      { key: "it_group_chat_id", value: -1002233445566, updated_at: isoNow },
      { key: "employees_can_set_critical", value: false, updated_at: isoNow }
    ],
    project_tasks: [
      {
        id: "task-101",
        title: "Deploy WPA3-Enterprise & Wi-Fi 6 APs in HQ",
        goal: "Upgrade all floor 2 & floor 3 Cisco APs to support 802.11ax and 802.1X EAP-TLS certificate authentication for high security.",
        deadline: new Date(now.getTime() + 5 * 86400000).toISOString(),
        priority: "HIGH",
        status: "IN_PROGRESS",
        progress: 60,
        assigned_to_id: userTechDanielId,
        created_by_id: userAdminSarahId,
        completion_note: null,
        completed_at: null,
        created_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
        updated_at: new Date(now.getTime() - 3600000).toISOString()
      },
      {
        id: "task-102",
        title: "Migrate LDAP Authentication to Entra ID (Azure AD)",
        goal: "Synchronize company on-prem directory with Microsoft Entra ID and enforce Conditional Access MFA policies across all staff.",
        deadline: new Date(now.getTime() + 12 * 86400000).toISOString(),
        priority: "CRITICAL",
        status: "PENDING",
        progress: 0,
        assigned_to_id: null,
        created_by_id: userAdminSarahId,
        completion_note: null,
        completed_at: null,
        created_at: new Date(now.getTime() - 1 * 86400000).toISOString(),
        updated_at: new Date(now.getTime() - 1 * 86400000).toISOString()
      }
    ],
    project_task_reports: [
      {
        id: "report-101",
        task_id: "task-101",
        technician_id: userTechDanielId,
        report_text: "Completed mounting APs in Zone B. Currently configuring RADIUS certificate trust profile on the controller.",
        progress: 60,
        status: "IN_PROGRESS",
        created_at: new Date(now.getTime() - 3600000).toISOString()
      }
    ],
    sla_events: []
  };
}

export function getMockStore(): MockDbStore {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = seedData();
  }
  return g[GLOBAL_KEY];
}
