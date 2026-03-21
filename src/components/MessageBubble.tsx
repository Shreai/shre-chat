import React, { useState, useRef, useEffect, useCallback, useMemo, memo, lazy, Suspense } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/common";
const ContentCard = lazy(() => import("./ContentCard"));
const MibWidgetBlock = lazy(() => import("./MibWidgetBlock"));
const DataCard = lazy(() => import("./DataCard"));
import type { ChatMessage } from "../openclaw";
import type { ProcessRun } from "./process-bar/types";
import {
  formatTime,
  copyToClipboard,
  estimateTokens,
  formatTokenCount,
  stripThinkBlocks,
  extractActionTags,
  ActionTag,
  TAG_STYLES,
  lightweightMarkdown,
  splitStableAndPending,
  classifySystemEvent,
  highlightSearchText,
  REACTION_EMOJIS,
} from "../chat-utils";
import { usePreferences } from "../preferences-store";

// ── CodeCopyButton ──────────────────────────────────────────────────
function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
      style={{
        background: copied ? "rgba(52,211,153,0.2)" : "var(--c-bg-hover)",
        color: copied ? "var(--c-emerald)" : "var(--c-text-3)",
        border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "var(--c-border-2)"}`,
      }}
      title={copied ? "Copied!" : "Copy code"}
      aria-label={copied ? "Copied to clipboard" : "Copy code block"}
    >
      {copied ? (
        <>
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </>
      )}
    </button>
  );
}

// ── CopyButton ──────────────────────────────────────────────────────
function CopyButton({ content, inline }: { content: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const btn = (
    <button
      onClick={handleCopy}
      className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
      style={{ color: copied ? "var(--c-emerald)" : "var(--c-text-5)" }}
      title={copied ? "Copied!" : "Copy message"}
      aria-label={copied ? "Copied to clipboard" : "Copy message"}
    >
      {copied ? (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      )}
    </button>
  );
  if (inline) return btn;
  return (
    <div className="flex items-center justify-end gap-0.5 mt-1 px-1">
      {btn}
    </div>
  );
}

// ── MessageActions ──────────────────────────────────────────────────
function MessageActions({ content, feedback, onFeedback, onRegenerate, onBranch, onReaction }: {
  content: string;
  feedback?: "like" | "dislike" | null;
  onFeedback: (fb: "like" | "dislike") => void;
  onRegenerate?: () => void;
  onBranch?: () => void;
  onReaction?: (emoji: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const reactionRef = useRef<HTMLDivElement>(null);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!reactionOpen) return;
    const handler = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setReactionOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [reactionOpen]);

  const handleCopy = async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = async () => {
    if (speaking) {
      speakAbortRef.current?.abort();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const abort = new AbortController();
    speakAbortRef.current = abort;
    try {
      // Strip markdown for cleaner speech — remove code blocks, links, images, headers
      const plainText = content
        .replace(/```[\s\S]*?```/g, " code block omitted ")
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/#{1,6}\s+/g, "")
        .replace(/[*_~]{1,3}/g, "")
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 4096); // TTS max input
      if (!plainText) { setSpeaking(false); return; }

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: plainText, voice: usePreferences.getState().ttsVoice }),
        signal: abort.signal,
      });
      if (!res.ok) {
        // Fallback to browser TTS
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(plainText);
          utter.rate = 1.0;
          utter.onend = () => setSpeaking(false);
          utter.onerror = () => setSpeaking(false);
          window.speechSynthesis.speak(utter);
          return;
        }
        setSpeaking(false);
        return;
      }
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(audioUrl); };
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(audioUrl); };
      // Allow aborting playback
      abort.signal.addEventListener("abort", () => { audio.pause(); audio.currentTime = 0; URL.revokeObjectURL(audioUrl); });
      await audio.play();
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        // Last resort: browser TTS
        if (window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(content.slice(0, 1000));
          utter.rate = 1.0;
          utter.onend = () => setSpeaking(false);
          window.speechSynthesis.speak(utter);
          return;
        }
      }
      setSpeaking(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5 mt-1 px-1">
      <button
        onClick={handleCopy}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: copied ? "var(--c-emerald)" : "var(--c-text-3)" }}
        title={copied ? "Copied!" : "Copy message"}
      >
        {copied ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        )}
      </button>
      <button
        onClick={handleSpeak}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: speaking ? "var(--c-accent)" : "var(--c-text-3)", animation: speaking ? "pulse 1.5s ease-in-out infinite" : "none" }}
        title={speaking ? "Stop speaking" : "Read aloud"}
      >
        {speaking ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        )}
      </button>
      <button
        onClick={() => onFeedback("like")}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: feedback === "like" ? "var(--c-emerald)" : "var(--c-text-3)" }}
        title="Helpful"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={feedback === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
      </button>
      <button
        onClick={() => onFeedback("dislike")}
        className="p-1 rounded transition-colors hover:bg-white/5"
        style={{ color: feedback === "dislike" ? "var(--c-danger-soft)" : "var(--c-text-3)" }}
        title="Not helpful"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={feedback === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
      </button>
      {onReaction && (
        <div ref={reactionRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            onClick={() => setReactionOpen((o) => !o)}
            className="p-1 rounded transition-colors hover:bg-white/5"
            style={{ color: reactionOpen ? "var(--c-accent)" : "var(--c-text-3)" }}
            title="Add reaction"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          {reactionOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 4px)",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--c-bg-2)",
                border: "1px solid var(--c-border-1)",
                borderRadius: "12px",
                padding: "4px 6px",
                display: "flex",
                gap: "2px",
                zIndex: 50,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                whiteSpace: "nowrap",
              }}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { onReaction(emoji); setReactionOpen(false); }}
                  className="rounded transition-transform hover:scale-125"
                  style={{ padding: "2px 4px", fontSize: "16px", lineHeight: 1, background: "transparent", border: "none", cursor: "pointer" }}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1 rounded transition-colors flex items-center gap-1"
          style={{ color: "var(--c-text-5)" }}
          title="Regenerate response"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span className="text-[10px]">Regenerate</span>
        </button>
      )}
      {onBranch && (
        <button
          onClick={onBranch}
          className="p-1 rounded transition-colors flex items-center gap-1"
          style={{ color: "var(--c-text-5)" }}
          title="Branch conversation here"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v3c0 2 2 3 6 3h3"/><line x1="6" y1="9" x2="6" y2="9"/></svg>
          <span className="text-[10px]">Branch</span>
        </button>
      )}
    </div>
  );
}

// ── ActionTagChips ──────────────────────────────────────────────────
function ActionTagChips({ tags }: { tags: ActionTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pt-2" style={{ borderTop: "1px solid var(--c-border-2)" }}>
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{
            color: tag.color,
            background: tag.bgColor,
            border: `1px solid ${tag.color}22`,
          }}
        >
          <span>{tag.icon}</span>
          <span>{TAG_STYLES[tag.type]?.label || tag.type}</span>
        </span>
      ))}
    </div>
  );
}

// ── Image Lightbox ──────────────────────────────────────────────────
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "rgba(255,255,255,0.15)",
          border: "none",
          borderRadius: "50%",
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "var(--c-on-accent)",
          fontSize: 20,
          lineHeight: 1,
          backdropFilter: "blur(8px)",
        }}
        aria-label="Close lightbox"
      >
        ✕
      </button>
      <img
        src={src} alt="Lightbox preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 8,
          cursor: "default",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

// ── StableMarkdownBlock ─────────────────────────────────────────────
// Memoized component for the "stable" (already-complete) portion of streaming text.
// Only re-renders when the stable text actually changes, not on every token.
export const StableMarkdownBlock = memo(function StableMarkdownBlock({ text }: { text: string }) {
  if (!text) return null;
  return <pre className="prose-chat whitespace-pre-wrap m-0 p-0 bg-transparent font-[inherit] text-[inherit] leading-relaxed" style={{ fontFamily: "inherit" }} dangerouslySetInnerHTML={{ __html: lightweightMarkdown(text) }} />;
});

// ── SystemEventChip ─────────────────────────────────────────────────
// Compact inline display for system/context messages
export function SystemEventChip({ message, timestamp }: { message: ChatMessage; timestamp?: string }) {
  const [expanded, setExpanded] = useState(false);
  const content = message.content.trim();

  // Group multiple system markers into chips
  const chips: { icon: string; label: string; color: string }[] = [];
  const seen = new Set<string>();
  const lines = content.split("\n").filter((l) => l.trim());

  // Classify the overall message
  const main = classifySystemEvent(content);
  if (!seen.has(main.label)) { chips.push(main); seen.add(main.label); }

  // Check for sub-events
  if (content.includes("compact") && !seen.has("Context compacted")) {
    chips.push({ icon: "\u27F3", label: "Context compacted", color: "var(--c-orange)" });
    seen.add("Context compacted");
  }
  if (content.includes("Session Startup") && !seen.has("Session refresh")) {
    chips.push({ icon: "\uD83D\uDD04", label: "Session refresh", color: "var(--c-info-soft)" });
    seen.add("Session refresh");
  }
  if (content.includes("AGENTS.md") && !seen.has("Agent startup")) {
    chips.push({ icon: "\uD83D\uDCCB", label: "Agent startup", color: "var(--c-purple)" });
    seen.add("Agent startup");
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Chip row */}
      <div className="flex items-center gap-1.5 py-1 px-2">
        <div className="flex-1 h-px" style={{ background: "var(--c-border-2)" }} />
        {chips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] transition-all hover:opacity-80"
            style={{
              background: "var(--c-bg-3)",
              color: chip.color,
              border: "1px solid var(--c-border-2)",
              cursor: "pointer",
            }}
            title="Click to view details"
          >
            <span>{chip.icon}</span>
            <span>{chip.label}</span>
          </button>
        ))}
        {timestamp && (
          <span className="text-[9px]" style={{ color: "var(--c-text-5)" }}>{timestamp}</span>
        )}
        <div className="flex-1 h-px" style={{ background: "var(--c-border-2)" }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mx-4 mb-2 rounded-lg overflow-hidden text-[11px] leading-relaxed"
          style={{
            background: "var(--c-bg-3)",
            border: "1px solid var(--c-border-2)",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: "1px solid var(--c-border-2)" }}>
            <span className="font-medium" style={{ color: "var(--c-text-3)" }}>System Event</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{ color: "var(--c-text-4)" }}
            >
              ✕
            </button>
          </div>
          <pre className="px-3 py-2 whitespace-pre-wrap break-words" style={{ color: "var(--c-text-4)", fontFamily: "inherit", margin: 0 }}>
            {content.length > 1000 ? content.slice(0, 1000) + "\n... (truncated)" : content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── MessageBubble ───────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ message, streaming, agentName, agentEmoji, userName, onRunCommand, onFeedback, editing, editText, onEditStart, onEditChange, onEditCancel, onEdit, searchHighlight, isCurrentSearchHit, onImageClick, compact, onRegenerate, selected, onAnnotate, onBranch, onReaction, onReply, replyPreview, onReplyClick, processRun, onRetry, onContentExpand, isBookmarked, onToggleBookmark }: { message: ChatMessage; streaming?: boolean; agentName: string; agentEmoji: string; userName?: string; onRunCommand?: (cmd: string) => void; onFeedback?: (fb: "like" | "dislike") => void; editing?: boolean; editText?: string; onEditStart?: () => void; onEditChange?: (text: string) => void; onEditCancel?: () => void; onEdit?: (newText: string) => void; searchHighlight?: string; isCurrentSearchHit?: boolean; onImageClick?: (src: string) => void; compact?: boolean; onRegenerate?: () => void; selected?: boolean; onAnnotate?: (text: string) => void; onBranch?: () => void; onReaction?: (emoji: string) => void; onReply?: () => void; replyPreview?: string | null; onReplyClick?: () => void; processRun?: ProcessRun | null; onRetry?: () => void; onContentExpand?: (content: string, type: string, title?: string) => void; isBookmarked?: boolean; onToggleBookmark?: () => void }) {
  const isUser = message.role === "user";
  const name = isUser ? (userName || "You") : agentName;
  const time = formatTime(message.timestamp);
  const stripped = isUser ? message.content : stripThinkBlocks(message.content);
  const { cleanText: displayContent, tags: actionTags } = isUser ? { cleanText: stripped, tags: [] } : extractActionTags(stripped);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const reactionPickerRef = useRef<HTMLDivElement>(null);

  // Close user reaction picker on outside click
  useEffect(() => {
    if (!reactionPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [reactionPickerOpen]);

  const [routeExpanded, setRouteExpanded] = useState(false);
  const [annotationEditing, setAnnotationEditing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState(message.annotation || "");
  const meta = message.meta;
  const shortModel = meta?.model ? meta.model.replace(/^.*\//, "").replace(/^claude-/, "").replace(/-\d{8}$/, "") : null;

  // Swipe-to-reply on mobile
  const [swipeX, setSwipeX] = useState(0);
  const swipeTouchRef = useRef<{ x: number; y: number; started: boolean } | null>(null);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, started: false };
  }, []);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchRef.current) return;
    const dx = e.touches[0].clientX - swipeTouchRef.current.x;
    const dy = Math.abs(e.touches[0].clientY - swipeTouchRef.current.y);
    // Only activate if horizontal swipe and moving right
    if (!swipeTouchRef.current.started && dy > 20) { swipeTouchRef.current = null; setSwipeX(0); return; }
    if (dx > 10) {
      swipeTouchRef.current.started = true;
      setSwipeX(Math.min(dx * 0.4, 60));
    }
  }, []);

  const handleSwipeTouchEnd = useCallback(() => {
    if (swipeX > 40 && onReply) {
      onReply();
      if (navigator.vibrate) navigator.vibrate(30);
    }
    setSwipeX(0);
    swipeTouchRef.current = null;
  }, [swipeX, onReply]);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${compact ? "max-w-2xl" : "max-w-3xl"} mx-auto`}>
      <div
        className={`${compact ? "max-w-[95%]" : "max-w-[85%]"} group/msg`}
        onTouchStart={onReply ? handleSwipeTouchStart : undefined}
        onTouchMove={onReply ? handleSwipeTouchMove : undefined}
        onTouchEnd={onReply ? handleSwipeTouchEnd : undefined}
        style={{
          ...(swipeX > 0 ? { transform: `translateX(${swipeX}px)`, transition: "none" } : { transition: "transform 0.2s ease-out, border-color 0.15s, padding-left 0.15s" }),
          borderLeft: selected ? "2px solid var(--c-accent)" : "2px solid transparent",
          paddingLeft: "8px",
          ...(selected ? { borderRadius: "2px" } : {}),
        }}
      >
        {/* Quoted reply preview */}
        {replyPreview && (
          <div
            onClick={onReplyClick}
            className="mb-1 px-2 py-1 rounded-lg text-xs truncate"
            style={{
              borderLeft: '3px solid var(--c-accent)',
              background: 'var(--c-bg-3)',
              color: 'var(--c-text-4)',
              cursor: onReplyClick ? 'pointer' : 'default',
              maxWidth: '100%',
            }}
            title="Click to scroll to original message"
          >
            {replyPreview.length > 80 ? replyPreview.slice(0, 80) + '...' : replyPreview}
          </div>
        )}
        {/* Name + timestamp + agent badge header */}
        <div className={`flex items-center gap-1.5 mb-0.5 px-1 ${isUser ? "justify-end" : "justify-start"}`}>
          {!isUser && <span className="text-[11px]">{agentEmoji}</span>}
          <span className="text-[11px] font-medium" style={{ color: "var(--c-text-2)" }}>{name}</span>
          {!isUser && shortModel && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "var(--c-bg-3)", color: "var(--c-accent)", border: "1px solid var(--c-border-2)" }}>{shortModel}</span>
          )}
          {time && <span className="text-[10px]" style={{ color: "var(--c-text-4)" }}>{time}</span>}
          <span className="text-[10px] opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150" style={{ color: "var(--c-text-5)" }}>{formatTokenCount(estimateTokens(message.content))}</span>
        </div>
        <div
          className={`rounded-2xl ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} leading-relaxed select-text`}
          style={{
            background: isUser ? "var(--c-msg-user)" : "var(--c-msg-ai)",
            color: "var(--c-text-1)",
            border: `1px solid ${isCurrentSearchHit ? "var(--c-accent)" : isUser ? "var(--c-accent-soft)" : "var(--c-border-2)"}`,
            boxShadow: isCurrentSearchHit ? "0 0 0 2px var(--c-accent), 0 0 12px rgba(99,102,241,0.25)" : undefined,
            transition: "border-color 0.2s, box-shadow 0.2s",
            WebkitUserSelect: "text",
            userSelect: "text",
          }}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words" style={editing ? { opacity: 0.5 } : undefined}>
              {editing && <div className="text-[10px] mb-1" style={{ color: "var(--c-accent)", opacity: 1 }}>Editing below ↓</div>}
              {searchHighlight ? highlightSearchText(displayContent, searchHighlight) : displayContent}
            </div>
          ) : streaming ? (
            /* Lightweight renderer during active streaming —
               avoids full ReactMarkdown AST parse on every token.
               Splits text into stable (complete blocks) + pending (tail).
               StableMarkdownBlock is memoized — only re-renders when a
               new block boundary (\n\n) appears. */
            (() => {
              const { stable, pending } = splitStableAndPending(displayContent);
              return (
                <div className="prose-chat break-words">
                  <StableMarkdownBlock text={stable} />
                  {pending && (
                    <pre className="prose-chat whitespace-pre-wrap m-0 p-0 bg-transparent font-[inherit] text-[inherit] leading-relaxed" style={{ fontFamily: "inherit" }} dangerouslySetInnerHTML={{ __html: lightweightMarkdown(pending) }} />
                  )}
                  <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse rounded-sm" />
                  <ActionTagChips tags={actionTags} />
                </div>
              );
            })()
          ) : (
            <div className="prose-chat break-words">
              <Suspense fallback={null}>
                <DataCard content={displayContent} />
              </Suspense>
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img({ src, alt, ...props }) {
                    return (
                      <img
                        src={src}
                        alt={alt || "Image"}
                        {...props}
                        onClick={() => src && onImageClick?.(src)}
                        style={{
                          cursor: "pointer",
                          borderRadius: 6,
                          maxWidth: "100%",
                          transition: "opacity 0.15s, box-shadow 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--c-accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                    );
                  },
                  a({ href, children, node, ...props }) {
                    // Detect standalone links: the link text equals the URL itself
                    const childText = typeof children === "string" ? children : Array.isArray(children) ? children.map(String).join("") : "";
                    const isStandalone = href && (childText === href || childText === href.replace(/^https?:\/\//, ""));
                    return (
                      <>
                        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--c-accent)" }} {...props}>{children}</a>
                        {/* LinkPreview disabled — unfurl cards cause layout shifts during scroll */}
                      </>
                    );
                  },
                  pre({ children }) {
                    return <>{children}</>;
                  },
                  code({ className, children, ...props }) {
                    const lang = className?.replace("language-", "") || "";
                    const codeText = String(children).replace(/\n$/, "");
                    const isBlock = Boolean(className) || codeText.includes("\n");

                    if (!isBlock) {
                      return <code className={className} {...props}>{children}</code>;
                    }

                    // ── mib-widget JSON blocks ──
                    if (lang === "mib-widget") {
                      try {
                        const parsed = JSON.parse(codeText.trim());
                        if (parsed && typeof parsed === "object" && parsed.type) {
                          return (
                            <Suspense fallback={<div style={{ padding: 8, color: "var(--c-text-4)", fontSize: 12 }}>Loading widget...</div>}>
                              <MibWidgetBlock block={parsed} />
                            </Suspense>
                          );
                        }
                      } catch { /* fall through to code block */ }
                    }

                    // ── Embeddable content blocks (lego blocks) ──
                    const contentTypes: Record<string, "html" | "json" | "chart" | "table"> = {
                      "html:preview": "html", "html:embed": "html",
                      "json:viewer": "json", "json:preview": "json",
                      "chart:bar": "chart", "chart:line": "chart", "chart:pie": "chart", "chart:area": "chart", "chart": "chart",
                      "table:preview": "table", "table:viewer": "table", "csv:preview": "table",
                    };
                    const contentType = contentTypes[lang];
                    if (contentType) {
                      return (
                        <Suspense fallback={<div style={{ padding: 8, color: "var(--c-text-4)", fontSize: 12 }}>Loading preview...</div>}>
                          <ContentCard type={contentType} content={codeText} onExpand={onContentExpand} />
                        </Suspense>
                      );
                    }

                    const isShell = ["bash", "sh", "zsh", "shell", "terminal", "console"].includes(lang);

                    // Syntax highlighting via highlight.js
                    let highlightedHtml = "";
                    try {
                      if (lang && hljs.getLanguage(lang)) {
                        highlightedHtml = hljs.highlight(codeText, { language: lang }).value;
                      } else {
                        highlightedHtml = hljs.highlightAuto(codeText).value;
                      }
                    } catch {
                      highlightedHtml = "";
                    }

                    return (
                      <div className="relative group">
                        {lang && <div className="hljs-lang-badge">{lang}</div>}
                        <pre>
                          {highlightedHtml ? (
                            <code className={`hljs ${className || ""}`} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                          ) : (
                            <code className={className} {...props}>{children}</code>
                          )}
                        </pre>
                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <CodeCopyButton code={codeText} />
                          {lang === "html" && (
                            <button
                              onClick={() => {
                                window.dispatchEvent(
                                  new CustomEvent("shre:open-preview", { detail: { html: codeText } })
                                );
                                // Navigate to Preview tab
                                window.dispatchEvent(new CustomEvent("shre:switch-view", { detail: "preview" }));
                              }}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{ background: "rgba(52,211,153,0.2)", color: "var(--c-emerald, #34d399)", border: "1px solid rgba(52,211,153,0.3)" }}
                              title="Open in Preview"
                            >
                              👁 Preview
                            </button>
                          )}
                          {isShell && onRunCommand && (
                            <button
                              onClick={() => onRunCommand(codeText)}
                              className="text-[10px] px-2 py-0.5 rounded"
                              style={{ background: "rgba(107,180,238,0.2)", color: "var(--c-terminal-accent)", border: "1px solid rgba(107,180,238,0.3)" }}
                              title="Run in terminal"
                            >
                              &#9654; Run
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  },
                }}
              >
                {displayContent}
              </Markdown>
              <ActionTagChips tags={actionTags} />
            </div>
          )}
        </div>
        {/* Agent routing metadata — collapsed pill / expandable detail */}
        {!isUser && !streaming && meta && shortModel && (
          <div className="flex items-center gap-1 mt-0.5 px-1">
            <button
              onClick={() => setRouteExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-all duration-150 hover:brightness-110"
              style={{
                background: meta.route === "ws" ? "rgba(99,102,241,0.12)" : meta.route === "cli" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color: meta.route === "ws" ? "rgb(129,140,248)" : meta.route === "cli" ? "rgb(52,211,153)" : "rgb(251,191,36)",
                border: `1px solid ${meta.route === "ws" ? "rgba(99,102,241,0.2)" : meta.route === "cli" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
              }}
              title="Click to show routing details"
            >
              <span>{shortModel}</span>
              <svg className={`h-2 w-2 transition-transform duration-150 ${routeExpanded ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3"/></svg>
            </button>
            {routeExpanded && (
              <div
                className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-[9px]"
                style={{
                  background: "var(--c-bg-3)",
                  color: "var(--c-text-4)",
                  border: "1px solid var(--c-border-2)",
                }}
              >
                <span title="Route">{meta.route?.toUpperCase()}</span>
                {meta.ttft_ms && <span title="Time to first token">TTFT {meta.ttft_ms}ms</span>}
                {meta.total_ms && <span title="Total response time">{(Number(meta.total_ms) / 1000).toFixed(1)}s</span>}
              </div>
            )}
          </div>
        )}
        {/* Per-message process steps — compact inline view for assistant messages */}
        {!isUser && !streaming && processRun && processRun.steps.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 pt-1.5 flex-wrap" style={{ borderTop: "1px solid var(--c-border-2)" }}>
            {processRun.steps.map((step) => {
              const icons: Record<string, string> = { thinking: "\u25C6", tool_use: "\u26A1", generating: "\u270E", compacting: "\u27F3", done: "\u2713", error: "\u2717" };
              const colors: Record<string, string> = { thinking: "var(--c-warning-soft)", tool_use: "var(--c-info-soft)", generating: "var(--c-success-soft)", compacting: "var(--c-orange)", done: "var(--c-emerald)", error: "var(--c-danger-soft)" };
              return (
                <span
                  key={step.id}
                  className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ color: colors[step.kind] || "var(--c-text-4)", background: "var(--c-bg-3)" }}
                  title={`${step.label}${step.toolName ? ` (${step.toolName})` : ""}${step.completedAt && step.startedAt ? ` \u2014 ${((step.completedAt - step.startedAt) / 1000).toFixed(1)}s` : ""}`}
                >
                  <span>{icons[step.kind] || "?"}</span>
                  <span style={{ color: "var(--c-text-4)" }}>{step.toolName || step.label}</span>
                </span>
              );
            })}
            {processRun.durationMs && (
              <span className="text-[9px] ml-auto" style={{ color: "var(--c-text-5)" }}>
                {(processRun.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
        {/* Message actions — copy + edit for user, copy + like/dislike for assistant */}
        {!streaming && message.content && !editing && (
          isUser ? (
            <div className="flex items-center justify-end gap-0.5 mt-1 px-1">
              {onAnnotate && (
                <button
                  onClick={() => { setAnnotationEditing(true); setAnnotationDraft(message.annotation || ""); }}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                  style={{ color: message.annotation ? "var(--c-accent)" : "var(--c-text-5)" }}
                  title={message.annotation ? "Edit annotation" : "Add annotation"}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              )}
              {onEditStart && (
                <button
                  onClick={onEditStart}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                  style={{ color: "var(--c-text-5)" }}
                  title="Edit message"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
              )}
              {onBranch && (
                <button
                  onClick={onBranch}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                  style={{ color: "var(--c-text-5)" }}
                  title="Branch conversation here"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 9v3c0 2 2 3 6 3h3"/></svg>
                </button>
              )}
              {onReaction && (
                <div ref={reactionPickerRef} style={{ position: "relative", display: "inline-block" }}>
                  <button
                    onClick={() => setReactionPickerOpen((o) => !o)}
                    className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                    style={{ color: reactionPickerOpen ? "var(--c-accent)" : "var(--c-text-5)" }}
                    title="Add reaction"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                  </button>
                  {reactionPickerOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 4px)",
                        right: 0,
                        background: "var(--c-bg-2)",
                        border: "1px solid var(--c-border-1)",
                        borderRadius: "12px",
                        padding: "4px 6px",
                        display: "flex",
                        gap: "2px",
                        zIndex: 50,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => { onReaction(emoji); setReactionPickerOpen(false); }}
                          className="rounded transition-transform hover:scale-125"
                          style={{ padding: "2px 4px", fontSize: "16px", lineHeight: 1, background: "transparent", border: "none", cursor: "pointer" }}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {onReply && (
                <button
                  onClick={onReply}
                  className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                  style={{ color: 'var(--c-text-5)' }}
                  title="Reply to this message"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                </button>
              )}
              <CopyButton content={message.content} inline />
              {onToggleBookmark && (
                <button
                  onClick={onToggleBookmark}
                  className={`p-1 rounded transition-colors ${isBookmarked ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"}`}
                  style={{ color: isBookmarked ? "var(--c-accent)" : "var(--c-text-5)" }}
                  title={isBookmarked ? "Remove bookmark" : "Bookmark this message"}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
              )}
            </div>
          ) : onFeedback ? (
            <div>
              <div className="flex items-center gap-0.5">
                <MessageActions content={message.content} feedback={message.feedback} onFeedback={onFeedback} onRegenerate={onRegenerate} onBranch={onBranch} onReaction={onReaction} />
                {onReply && (
                  <button
                    onClick={onReply}
                    className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                    style={{ color: 'var(--c-text-5)' }}
                    title="Reply to this message"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                  </button>
                )}
                {onAnnotate && (
                  <button
                    onClick={() => { setAnnotationEditing(true); setAnnotationDraft(message.annotation || ""); }}
                    className="p-1 rounded transition-colors opacity-0 group-hover/msg:opacity-100"
                    style={{ color: message.annotation ? "var(--c-accent)" : "var(--c-text-5)" }}
                    title={message.annotation ? "Edit annotation" : "Add annotation"}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </button>
                )}
                {onToggleBookmark && (
                  <button
                    onClick={onToggleBookmark}
                    className={`p-1 rounded transition-colors ${isBookmarked ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"}`}
                    style={{ color: isBookmarked ? "var(--c-accent)" : "var(--c-text-5)" }}
                    title={isBookmarked ? "Remove bookmark" : "Bookmark this message"}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  </button>
                )}
              </div>
            </div>
          ) : null
        )}
        {/* Retry button for error messages */}
        {!isUser && message.content.startsWith("Error:") && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-125"
            style={{ background: "rgba(239,68,68,0.1)", color: "var(--c-danger-soft)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Retry
          </button>
        )}
        {/* Annotation inline editor */}
        {annotationEditing && onAnnotate && (
          <div className="mt-1 px-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                className="flex-1 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1"
                style={{
                  background: "var(--c-bg-2)",
                  color: "var(--c-text-1)",
                  border: "1px solid var(--c-border-1)",
                }}
                value={annotationDraft}
                onChange={(e) => setAnnotationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onAnnotate(annotationDraft); setAnnotationEditing(false); }
                  if (e.key === "Escape") setAnnotationEditing(false);
                }}
                placeholder="Add a note..."
                autoFocus
              />
              <button
                onClick={() => { onAnnotate(annotationDraft); setAnnotationEditing(false); }}
                className="text-[10px] px-2 py-1 rounded-lg font-medium"
                style={{ color: "var(--c-on-accent)", background: "var(--c-accent)" }}
              >
                Save
              </button>
              <button
                onClick={() => setAnnotationEditing(false)}
                className="text-[10px] px-1.5 py-1 rounded-lg"
                style={{ color: "var(--c-text-4)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* Annotation display */}
        {!annotationEditing && message.annotation && (
          <div
            className="mt-1 mx-1 px-2 py-1 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
            style={{
              background: "color-mix(in srgb, var(--c-accent) 10%, transparent)",
              borderLeft: "2px solid var(--c-accent)",
              color: "var(--c-text-3)",
            }}
            onClick={() => { if (onAnnotate) { setAnnotationEditing(true); setAnnotationDraft(message.annotation || ""); } }}
            title="Click to edit annotation"
          >
            <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span className="flex-1 truncate">{message.annotation}</span>
            {onAnnotate && (
              <button
                onClick={(e) => { e.stopPropagation(); onAnnotate(""); }}
                className="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                style={{ color: "var(--c-text-5)" }}
                title="Remove annotation"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        )}
        {/* Reaction pills */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {Object.entries(message.reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReaction?.(emoji)}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-colors"
                style={{
                  background: "color-mix(in srgb, var(--c-accent) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--c-accent) 25%, transparent)",
                  color: "var(--c-text-2)",
                  cursor: "pointer",
                  lineHeight: 1.2,
                }}
                title={`${emoji} ${count}`}
              >
                <span style={{ fontSize: "14px" }}>{emoji}</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--c-text-3)" }}>{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
