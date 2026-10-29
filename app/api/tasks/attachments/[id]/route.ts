import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = supabaseAdmin();

    const { data: attachment, error } = await db
      .from("project_task_attachments")
      .select("id, file_name, file_type, file_size, file_data")
      .eq("id", params.id)
      .single();

    if (error || !attachment || !attachment.file_data) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const fileBuffer = Buffer.from(attachment.file_data, "base64");
    const mimeType = attachment.file_type || "application/octet-stream";
    const fileName = attachment.file_name || "attachment";

    // For images and PDFs, allow inline viewing in browser. For DOCX/Word, trigger download.
    const isInline = mimeType.startsWith("image/") || mimeType === "application/pdf";
    const disposition = isInline
      ? `inline; filename="${encodeURIComponent(fileName)}"`
      : `attachment; filename="${encodeURIComponent(fileName)}"`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileBuffer.length),
        "Content-Disposition": disposition,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load attachment" }, { status: 500 });
  }
}

