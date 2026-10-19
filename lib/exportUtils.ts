/**
 * Modern, robust client-side export utilities for CSV, Excel, and Clipboard
 * Works reliably across all browsers, mobile devices, and WebViews (including Telegram).
 */

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  // Replace internal quotes with double quotes per RFC 4180
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCsvString(headers: string[], rows: (string | number | null | undefined)[][]): string {
  // \uFEFF is the UTF-8 Byte Order Mark (BOM) ensuring Excel displays UTF-8 and symbols properly
  const bom = "\uFEFF";
  const headerLine = headers.map(sanitizeCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(sanitizeCsvCell).join(","));
  return bom + [headerLine, ...dataLines].join("\r\n");
}

export function downloadCsv(filename: string, csvContent: string): boolean {
  try {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1500);
    return true;
  } catch (err) {
    console.error("Failed to download CSV via Blob:", err);
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard failed, attempting fallback:", err);
  }

  // Fallback for older browsers or restricted iframe environments
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error("Clipboard copy fallback failed:", err);
    return false;
  }
}
