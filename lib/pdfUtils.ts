import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  summaryCards?: { label: string; value: string | number }[];
}

/**
 * Generates and downloads a real, professional PDF file directly to the user's device.
 * Includes executive letterhead, KPI summary cards, and multi-page auto-paginated table.
 */
export function generatePdfReport(options: PdfReportOptions): boolean {
  try {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Header Banner
    doc.setFillColor(30, 27, 75); // Dark Indigo (slate-900 / indigo-950)
    doc.rect(0, 0, pageWidth, 25, "F");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(options.title, 14, 11);

    // Subtitle & Timestamp
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(199, 210, 254);
    const dateStr = `Generated on ${new Date().toLocaleString()} | TAF IT Support System`;
    doc.text(options.subtitle ? `${options.subtitle} • ${dateStr}` : dateStr, 14, 18);

    let startY = 30;

    // 2. Summary KPI Cards Strip
    if (options.summaryCards && options.summaryCards.length > 0) {
      const cards = options.summaryCards.slice(0, 5);
      const cardWidth = (pageWidth - 28 - (cards.length - 1) * 4) / cards.length;
      const cardHeight = 15;

      cards.forEach((card, idx) => {
        const x = 14 + idx * (cardWidth + 4);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, "FD");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(String(card.label).toUpperCase(), x + 4, startY + 5);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(String(card.value), x + 4, startY + 11.5);
      });

      startY += cardHeight + 6;
    }

    // 3. Format and clean table rows
    const formattedRows = options.rows.map((row) =>
      row.map((cell) => {
        if (cell === null || cell === undefined || cell === "") return "—";
        return String(cell).trim();
      })
    );

    // 4. Render Table with autoTable
    autoTable(doc, {
      head: [options.headers],
      body: formattedRows,
      startY: startY,
      theme: "grid",
      styles: {
        cellPadding: 2.5,
        overflow: "linebreak"
      },
      headStyles: {
        fillColor: [49, 46, 129], // Deep Indigo
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        halign: "left"
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        lineColor: [241, 245, 249],
        lineWidth: 0.1
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14, bottom: 16 },
      didDrawPage: (data) => {
        // Footer on every page
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${data.pageNumber} • TAF IT Helpdesk Operations Official Document`,
          14,
          pageHeight - 8
        );
        doc.text(
          "Confidential IT Document",
          pageWidth - 14,
          pageHeight - 8,
          { align: "right" }
        );
      }
    });

    const finalFilename = options.filename.endsWith(".pdf")
      ? options.filename
      : `${options.filename}.pdf`;

    doc.save(finalFilename);
    return true;
  } catch (err) {
    console.error("Failed to generate PDF with jsPDF:", err);
    return false;
  }
}

/**
 * Opens a dedicated, clean printable HTML document in a popup window or iframe and triggers print/save to PDF.
 * Avoids modal clipping, scrollbars, or cutoffs.
 */
export function printExecutiveDocument(options: PdfReportOptions): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // If popup blocked, fallback to normal window.print()
    window.print();
    return;
  }

  const cardsHtml =
    options.summaryCards && options.summaryCards.length > 0
      ? `
      <div class="kpi-grid">
        ${options.summaryCards
          .map(
            (c) => `
          <div class="kpi-card">
            <div class="kpi-label">${c.label}</div>
            <div class="kpi-val">${c.value}</div>
          </div>
        `
          )
          .join("")}
      </div>`
      : "";

  const tableHeadersHtml = options.headers.map((h) => `<th>${h}</th>`).join("");
  const tableRowsHtml = options.rows
    .map(
      (row) => `
      <tr>
        ${row
          .map(
            (cell) =>
              `<td>${cell === null || cell === undefined || cell === "" ? "—" : String(cell)}</td>`
          )
          .join("")}
      </tr>
    `
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${options.title} - TAF IT Support</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 10mm 12mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #0f172a;
      background: #fff;
    }
    .header-banner {
      background: linear-gradient(90deg, #0f172a 0%, #1e1b4b 100%);
      color: #fff;
      padding: 18px 22px;
      border-radius: 12px;
      margin-bottom: 18px;
    }
    .header-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(99, 102, 241, 0.25);
      color: #c7d2fe;
      border: 1px solid rgba(165, 180, 252, 0.3);
      padding: 2px 8px;
      border-radius: 999px;
      margin-bottom: 6px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.02em;
    }
    .subtitle {
      margin: 4px 0 0 0;
      font-size: 11px;
      color: #94a3b8;
    }
    .kpi-grid {
      display: flex;
      gap: 10px;
      margin-bottom: 18px;
    }
    .kpi-card {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .kpi-label {
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-val {
      font-size: 16px;
      font-weight: 900;
      color: #1e293b;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 20px;
    }
    th {
      background-color: #312e81;
      color: #ffffff;
      font-weight: 800;
      text-align: left;
      padding: 7px 9px;
      border: 1px solid #312e81;
      font-size: 9.5px;
    }
    td {
      padding: 6px 9px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      line-height: 1.4;
      vertical-align: top;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <div class="header-tag">TAF IT Support Hub • Official Briefing</div>
    <h1>${options.title}</h1>
    <div class="subtitle">${options.subtitle || "System Operations & Performance Records"} • Generated ${new Date().toLocaleString()}</div>
  </div>

  ${cardsHtml}

  <table>
    <thead>
      <tr>${tableHeadersHtml}</tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <span>TAF IT Support Management System • Confidential</span>
    <span>Document ID: #${Date.now().toString(36).toUpperCase()}</span>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
