import { useState, useRef, useEffect } from "react";

interface Props {
  content: string;
  title?: string;
}

export function MessageExportMenu({ content, title }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = async (format: string) => {
    setLoading(format);
    try {
      const utils = await import("../lib/export-utils");
      if (format === "pdf") {
        // Check if content has a markdown table — export as table PDF
        const table = utils.parseMarkdownTable(content);
        if (table && table.rows.length > 2) {
          await utils.exportTableToPDF(table.headers, table.rows, title);
        } else {
          await utils.exportProseToPDF(content, title);
        }
      } else if (format === "excel") {
        const table = utils.parseMarkdownTable(content);
        if (table) {
          await utils.exportToExcel(table.headers, table.rows, title);
        }
      } else if (format === "csv") {
        const table = utils.parseMarkdownTable(content);
        if (table) {
          utils.exportToCSV(table.headers, table.rows, title);
        }
      } else if (format === "word") {
        utils.exportToWord(content, title);
      } else if (format === "text") {
        utils.exportToText(content, title);
      }
    } catch (err) {
      console.error("[export]", err);
    } finally {
      setLoading(null);
      setOpen(false);
    }
  };

  const hasTable = /\|.*\|.*\|/.test(content) && content.includes("---");

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded transition-colors"
        style={{ color: "var(--c-text-4)" }}
        title="Export"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-1 rounded-lg shadow-lg py-1 z-50"
          style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border-1)", minWidth: 140 }}
        >
          <div className="px-2 py-1 text-[9px] uppercase font-semibold" style={{ color: "var(--c-text-5)" }}>Export</div>
          <MenuItem label="PDF" icon="📄" loading={loading === "pdf"} onClick={() => handleExport("pdf")} />
          {hasTable && (
            <>
              <MenuItem label="Excel" icon="📊" loading={loading === "excel"} onClick={() => handleExport("excel")} />
              <MenuItem label="CSV" icon="📋" loading={loading === "csv"} onClick={() => handleExport("csv")} />
            </>
          )}
          <MenuItem label="Word" icon="📝" loading={loading === "word"} onClick={() => handleExport("word")} />
          <MenuItem label="Text" icon="📃" loading={loading === "text"} onClick={() => handleExport("text")} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, icon, loading, onClick }: { label: string; icon: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:opacity-80 transition-opacity disabled:opacity-50"
      style={{ color: "var(--c-text-2)" }}
    >
      <span className="text-[11px]">{icon}</span>
      <span>{label}</span>
      {loading && <span className="ml-auto text-[10px]" style={{ color: "var(--c-text-5)" }}>...</span>}
    </button>
  );
}
