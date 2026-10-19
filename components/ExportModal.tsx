"use client";

import React, { useState } from "react";
import { buildCsvString, downloadCsv, copyToClipboard } from "@/lib/exportUtils";

export interface SummaryCardItem {
  label: string;
  value: string | number;
  icon?: string;
  accent?: string;
}

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  filenamePrefix: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  detailedOption?: {
    label: string;
    description: string;
    headers: string[];
    rows: (string | number | null | undefined)[][];
  };
  summaryCards?: SummaryCardItem[];
}

export function ExportModal({
  isOpen,
  onClose,
  title,
  subtitle,
  filenamePrefix,
  headers,
  rows,
  detailedOption,
  summaryCards
}: ExportModalProps) {
  const [includeDetails, setIncludeDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"export" | "preview">("export");

  if (!isOpen) return null;

  const activeHeaders = includeDetails && detailedOption ? detailedOption.headers : headers;
  const activeRows = includeDetails && detailedOption ? detailedOption.rows : rows;

  const dateStamp = new Date().toISOString().split("T")[0];
  const finalFilename = `${filenamePrefix}_${includeDetails ? "Detailed_" : ""}${dateStamp}.csv`;

  const handleDownload = () => {
    const csv = buildCsvString(activeHeaders, activeRows);
    const ok = downloadCsv(finalFilename, csv);
    if (ok) {
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3500);
    }
  };

  const handleCopy = async () => {
    const csv = buildCsvString(activeHeaders, activeRows);
    const ok = await copyToClipboard(csv);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Print Specific CSS to make printed report gorgeous */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-report-area, #printable-report-area * {
            visibility: visible !important;
          }
          #printable-report-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 24px !important;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Modal Container */}
      <div
        id="printable-report-area"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header Banner */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-start justify-between gap-4 border-b border-indigo-500/20">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                Data & Report Hub
              </span>
              <span className="text-[11px] font-semibold text-slate-300">
                {activeRows.length} record{activeRows.length === 1 ? "" : "s"} ready
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>📊</span>
              <span>{title}</span>
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="no-print p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Controls (Export vs Live Preview) */}
        <div className="no-print flex items-center justify-between px-5 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex gap-2 text-xs font-bold">
            <button
              onClick={() => setActiveTab("export")}
              className={`pb-2.5 px-3 border-b-2 transition-all ${
                activeTab === "export"
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              Export Options
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === "preview"
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <span>Live Preview</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 font-mono">
                {activeRows.length}
              </span>
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono truncate hidden sm:inline">
            {finalFilename}
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-900 dark:text-slate-100">
          {/* Executive Summary Cards (if present) */}
          {summaryCards && summaryCards.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {summaryCards.map((sc, i) => (
                <div
                  key={i}
                  className="p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="text-[10px] uppercase font-bold tracking-wider">{sc.label}</span>
                    {sc.icon && <span className="text-sm">{sc.icon}</span>}
                  </div>
                  <p
                    className="text-lg font-black tracking-tight"
                    style={{ color: sc.accent || undefined }}
                  >
                    {sc.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "export" ? (
            <div className="space-y-4">
              {/* Optional: Detailed log toggle */}
              {detailedOption && (
                <div
                  onClick={() => setIncludeDetails(!includeDetails)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    includeDetails
                      ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 ring-1 ring-indigo-500/30"
                      : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {detailedOption.label}
                      </span>
                      {includeDetails && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">
                          Expanded Mode
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {detailedOption.description}
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={includeDetails}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 pointer-events-none shrink-0"
                  />
                </div>
              )}

              {/* Action Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. CSV Download */}
                <button
                  onClick={handleDownload}
                  className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 bg-gradient-to-b from-indigo-50/50 to-indigo-100/30 dark:from-indigo-950/40 dark:to-indigo-900/20 hover:border-indigo-400 hover:shadow-md transition-all text-left flex flex-col justify-between space-y-3 group active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold shadow-sm shadow-indigo-600/30 group-hover:scale-110 transition-transform">
                      📥
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                      Excel / CSV
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Download File
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Formatted with UTF-8 BOM for Microsoft Excel & Google Sheets.
                    </p>
                  </div>
                </button>

                {/* 2. Copy to Clipboard */}
                <button
                  onClick={handleCopy}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all text-left flex flex-col justify-between space-y-3 group active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg font-bold shadow-sm shadow-emerald-600/30 group-hover:scale-110 transition-transform">
                      {copied ? "✓" : "📋"}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      copied ? "bg-emerald-500/20 text-emerald-600" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                    }`}>
                      {copied ? "Copied!" : "Clipboard"}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {copied ? "Copied to Clipboard!" : "Copy CSV Text"}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Instant copy for Telegram, Slack, or fast paste into spreadsheets.
                    </p>
                  </div>
                </button>

                {/* 3. Print / PDF */}
                <button
                  onClick={handlePrint}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all text-left flex flex-col justify-between space-y-3 group active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-10 rounded-xl bg-slate-700 text-white flex items-center justify-center text-lg font-bold shadow-sm group-hover:scale-110 transition-transform">
                      🖨️
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                      Print / PDF
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Print or Save PDF
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Executive document layout ready for printer or PDF archiving.
                    </p>
                  </div>
                </button>
              </div>

              {/* Feedback Alert Toast */}
              {downloadSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">✓</span>
                    <span>Download started: <strong>{finalFilename}</strong></span>
                  </div>
                  <span className="text-[10px] opacity-75">Check your downloads folder</span>
                </div>
              )}
            </div>
          ) : (
            /* Live Data Table Preview */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Showing first {Math.min(activeRows.length, 6)} of {activeRows.length} rows</span>
                <span className="font-mono text-[11px]">{activeHeaders.length} columns</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 max-h-72">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                    <tr>
                      {activeHeaders.map((h, i) => (
                        <th
                          key={i}
                          className="p-2.5 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-[11px]">
                    {activeRows.slice(0, 6).map((r, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {r.map((cell, colIdx) => (
                          <td
                            key={colIdx}
                            className="p-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-xs truncate"
                            title={String(cell ?? "")}
                          >
                            {String(cell ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {activeRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={activeHeaders.length}
                          className="p-6 text-center text-slate-400"
                        >
                          No records found to export.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="no-print p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Exported from <strong>TAF IT Support Hub</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
            >
              <span>📥 Download CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
