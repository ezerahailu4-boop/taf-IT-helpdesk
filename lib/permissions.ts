import type { DbTicket, DbUser } from "@/types/db";

export class ForbiddenError extends Error {
  status = 403;
}

export function assertCanViewTicket(user: DbUser, ticket: DbTicket) {
  if (user.role === "ADMIN") return;
  if (user.role === "TECHNICIAN") return; // technicians can view any ticket to pick up unassigned work
  if (user.role === "EMPLOYEE" && ticket.requester_id === user.id) return;
  throw new ForbiddenError("You cannot view this ticket");
}

export function assertCanComment(user: DbUser, ticket: DbTicket) {
  // Anyone who can view a ticket may add a customer-visible comment,
  // except a closed/cancelled ticket which is read-only until reopened.
  assertCanViewTicket(user, ticket);
  if (["CLOSED", "CANCELLED"].includes(ticket.status)) {
    throw new ForbiddenError("This ticket is closed. Reopen it to continue the conversation.");
  }
}

export function assertCanManageTicket(user: DbUser) {
  if (user.role !== "TECHNICIAN" && user.role !== "ADMIN") {
    throw new ForbiddenError("Only IT staff can perform this action");
  }
}

export function assertIsAdmin(user: DbUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Admins only");
}

export function assertCanSetPriority(user: DbUser, priority: string, allowEmployeeCritical: boolean) {
  if (user.role !== "EMPLOYEE") return; // technicians/admins can set any priority
  if (priority === "CRITICAL" && !allowEmployeeCritical) {
    throw new ForbiddenError("Only IT staff can mark a ticket as Critical");
  }
}

export function assertCanResolve(user: DbUser) {
  assertCanManageTicket(user);
}

export function assertCanCloseOrReopen(user: DbUser, ticket: DbTicket) {
  if (user.role === "ADMIN" || user.role === "TECHNICIAN") return;
  if (ticket.requester_id === user.id) return;
  throw new ForbiddenError("Only the requester or IT staff can do this");
}

export function assertCanSeeInternalNotes(user: DbUser) {
  if (user.role === "EMPLOYEE") {
    throw new ForbiddenError("Internal notes are not visible to employees");
  }
}
