/**
 * VoiceTurnContent — rich markdown renderer for assistant voice turns.
 * Extracted from VoiceAssistant.tsx.
 */
import { memo, lazy, Suspense } from "react";

const Markdown = lazy(() => import("react-markdown"));
const DataCard = lazy(() => import("../components/DataCard"));
const remarkGfmPromise = import("remark-gfm").then(m => m.default);
let remarkGfmPlugin: any = null;
remarkGfmPromise.then(p => { remarkGfmPlugin = p; });

export const VoiceTurnContent = memo(function VoiceTurnContent({ text, role }: { text: string; role: string }) {
  if (role === "user") return <>{text}</>;

  return (
    <Suspense fallback={<span>{text}</span>}>
      <DataCard content={text} />
      <Markdown
        remarkPlugins={remarkGfmPlugin ? [remarkGfmPlugin] : []}
        components={{
          table({ children }) {
            return (
              <div style={{ overflowX: "auto", margin: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead style={{ background: "rgba(255,255,255,0.06)" }}>{children}</thead>;
          },
          th({ children }) {
            return (
              <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap" }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td style={{ padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", fontFamily: "'SF Mono', monospace", fontSize: 12 }}>
                {children}
              </td>
            );
          },
          strong({ children }) {
            return <strong style={{ color: "rgba(255,255,255,0.95)", fontWeight: 600 }}>{children}</strong>;
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(96,165,250,0.9)", textDecoration: "underline" }}>{children}</a>;
          },
          ul({ children }) {
            return <ul style={{ paddingLeft: 16, margin: "4px 0", listStyleType: "disc" }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: 16, margin: "4px 0", listStyleType: "decimal" }}>{children}</ol>;
          },
          li({ children }) {
            return <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>;
          },
          code({ className, children }) {
            const isBlock = Boolean(className) || String(children).includes("\n");
            if (isBlock) {
              return (
                <pre style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "8px 10px", margin: "6px 0", overflowX: "auto", fontSize: 11, lineHeight: 1.4 }}>
                  <code style={{ fontFamily: "'SF Mono', monospace", color: "rgba(255,255,255,0.8)" }}>{children}</code>
                </pre>
              );
            }
            return <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em", fontFamily: "'SF Mono', monospace" }}>{children}</code>;
          },
          p({ children }) {
            return <p style={{ margin: "4px 0", lineHeight: 1.6 }}>{children}</p>;
          },
          h1({ children }) { return <div style={{ fontSize: 16, fontWeight: 700, margin: "8px 0 4px", color: "rgba(255,255,255,0.95)" }}>{children}</div>; },
          h2({ children }) { return <div style={{ fontSize: 15, fontWeight: 600, margin: "6px 0 3px", color: "rgba(255,255,255,0.9)" }}>{children}</div>; },
          h3({ children }) { return <div style={{ fontSize: 14, fontWeight: 600, margin: "4px 0 2px", color: "rgba(255,255,255,0.85)" }}>{children}</div>; },
          hr() { return <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />; },
        }}
      >
        {text}
      </Markdown>
    </Suspense>
  );
});
