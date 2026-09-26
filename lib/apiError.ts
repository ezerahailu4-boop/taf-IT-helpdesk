import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/getUser";
import { ForbiddenError } from "@/lib/permissions";

export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
  }
  const anyErr = err as { status?: number; message?: string };
  const status = anyErr?.status ?? 500;
  if (status !== 500 && anyErr?.message) {
    return NextResponse.json({ error: anyErr.message }, { status });
  }
  console.error("[api error]:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
