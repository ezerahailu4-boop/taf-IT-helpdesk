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
  rating?: number | null;
  rating_comment?: string | null;
  rated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectTaskStatus = "PENDING" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type ProjectTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectTaskCategory = "PLANNED" | "UNPLANNED";

export interface DbProjectTask {
  id: string;
  title: string;
  goal: string;
  deadline: string;
  priority: ProjectTaskPriority;
  category?: ProjectTaskCategory;
  status: ProjectTaskStatus;
  progress: number;
  assigned_to_id: string | null;
  assigned_technician_ids?: string[] | null;
  created_by_id: string | null;
  completion_note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProjectTaskReport {
  id: string;
  task_id: string;
  technician_id: string;
  report_text: string;
  progress: number;
  status: ProjectTaskStatus;
  created_at: string;
}
