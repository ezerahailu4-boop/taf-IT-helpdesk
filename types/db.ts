export type UserRole = "EMPLOYEE" | "TECHNICIAN" | "ADMIN";

export type TicketStatus =
  | "NEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_FOR_USER"
  | "WAITING_FOR_ADMIN" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DbUser {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  phone: string | null;
  role: UserRole;
  department_id: string | null;
  location_id: string | null;
  support_group_id: string | null;
  is_active: boolean;
  is_registered?: boolean;
  created_at: string;
  last_active_at: string;
}

export interface DbTicket {
  id: string;
  ticket_number: string;
  requester_id: string;
  department_id: string | null;
  category_id: string | null;
  support_group_id: string | null;
  subject: string;
  description: string;
  location_id: string | null;
  asset_id: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_technician_id: string | null;
  sla_policy_id: string | null;
  response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
  reopened_count: number;
  created_at: string;
  updated_at: string;
}
