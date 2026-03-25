import React, { useState, useEffect, memo } from "react";

// ── Link Preview component for URL unfurling ────────────────────────

interface UnfurlData {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
}

const LinkPreview = memo(function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<UnfurlData | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/unfurl?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json())
      .then((d: UnfurlData) => {
        if (!cancelled) {
          setData(d);
          setStatus("done");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
  }, [url]);

  // Don't render anything while loading or on error — avoids layout shifts
  if (status !== "done") return null;
  if (!data || (!data.title && !data.description && !data.image)) return null;

  let domain = "";
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { void _; }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex rounded-lg overflow-hidden no-underline transition-colors"
      style={{
        border: "1px solid var(--c-border-2)",
        background: "var(--c-bg-2)",
        color: "var(--c-text-1)",
        textDecoration: "none",
        maxWidth: 480,
        display: "flex",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--c-accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--c-border-2)"; }}
    >
      {data.image && (
        <div style={{ width: 100, minHeight: 72, flexShrink: 0, background: "var(--c-bg-3)" }}>
          <img
            src={data.image}
            alt={data.title ? `Preview for ${data.title}` : "Link preview thumbnail"}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
          />
        </div>
      )}
      <div className="flex flex-col justify-center gap-0.5 px-3 py-2 min-w-0">
        {domain && (
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--c-text-5)" }}>
            {domain}
          </span>
        )}
        {data.title && (
          <span className="text-xs font-medium truncate" style={{ color: "var(--c-text-1)" }}>
            {data.title}
          </span>
        )}
        {data.description && (
          <span className="text-[11px] line-clamp-2" style={{ color: "var(--c-text-4)" }}>
            {data.description.length > 150 ? data.description.slice(0, 150) + "..." : data.description}
          </span>
        )}
      </div>
    </a>
  );
});

export default LinkPreview;
