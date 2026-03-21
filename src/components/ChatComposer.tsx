import React, { lazy, Suspense } from "react";
import { ViewErrorBoundary } from "../ViewErrorBoundary";
import { estimateTokens, formatTokenCount, MAX_RECORDING_SECONDS } from "../chat-utils";
import type { UploadedFile } from "../store";

const EmojiPicker = lazy(() =>
  import("@emoji-mart/react").then((mod) => ({
    default: (props: any) => <mod.default {...props} />,
  }))
);

interface ChatComposerProps {
  input: string;
  setInput: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onAbort: () => void;
  streaming: boolean;
  syncing: boolean;
  writeEnabled: boolean;
  compareMode: boolean;
  compareModelsCount: number;
  cliMode: boolean;
  currentAgentName: string;
  activeSessionId: string | null;
  messages: { role: string; content: string }[];

  // Refs
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  emojiRef: React.RefObject<HTMLDivElement | null>;

  // File handling
  pendingFiles: UploadedFile[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePendingFile: (id: string) => void;
  onImageClick: (src: string) => void;
  onPaste: (e: React.ClipboardEvent) => void;

  // Emoji
  showEmoji: boolean;
  setShowEmoji: (val: boolean) => void;

  // Voice
  isRecording: boolean;
  voicePhase: string;
  audioLevel: number;
  recordingDuration: number;
  isSpeaking: boolean;
  interimTranscript: string;
  isHandsFree: boolean;
  voiceMode: boolean;
  ttsVoice: string;
  speechSupported: boolean;
  hasSpeechRecognition: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  setIsHandsFree: (val: boolean) => void;
  setVoiceMode: (val: boolean) => void;
  setTtsVoice: (val: string) => void;
  onStopTTS: () => void;

  // Terminal
  showTerminal: boolean;
  termViewMode: string;
  onToggleTerminal: () => void;
  onToggleTermViewMode: () => void;

  // Slash commands
  slashOpen: boolean;
  slashFiltered: { name: string; description: string; usage: string }[];
  slashIndex: number;
  slashRef: React.RefObject<HTMLDivElement | null>;
  setSlashIndex: (val: number) => void;
  onSlashSelect: (cmd: string) => void;

  // Reply
  replyToIndex: number | null;
  replyToContent: string | null;
  onCancelReply: () => void;

  // Editing
  editingMsgIndex: number | null;
  editingQueueId: string | null;
  onCancelEdit: () => void;

  // Suggestions
  suggestions: string[];
  onSelectSuggestion: (s: string) => void;

  // Voice announcement
  voiceAnnouncement: string;

  // Queue
  queueCount: number;

  // Draft
  onInputChange: (val: string) => void;

  // Filtered messages for reply preview
  filteredMessages: { content: string }[];
}

export function ChatComposer(props: ChatComposerProps) {
  const {
    input, setInput, onKeyDown, onSend, onAbort, streaming, syncing, writeEnabled,
    compareMode, compareModelsCount, cliMode, currentAgentName,
    activeSessionId, messages,
    inputRef, fileRef, emojiRef,
    pendingFiles, onFileSelect, onRemovePendingFile, onImageClick, onPaste,
    showEmoji, setShowEmoji,
    isRecording, voicePhase, audioLevel, recordingDuration, isSpeaking,
    interimTranscript, isHandsFree, voiceMode, ttsVoice, speechSupported,
    hasSpeechRecognition, onStartRecording, onStopRecording,
    setIsHandsFree, setVoiceMode, setTtsVoice, onStopTTS,
    showTerminal, termViewMode, onToggleTerminal, onToggleTermViewMode,
    slashOpen, slashFiltered, slashIndex, slashRef, setSlashIndex, onSlashSelect,
    replyToIndex, replyToContent, onCancelReply,
    editingMsgIndex, editingQueueId, onCancelEdit,
    suggestions, onSelectSuggestion,
    voiceAnnouncement, queueCount,
    onInputChange, filteredMessages,
  } = props;

  return (
    <>
      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="px-4 py-2 flex gap-2 flex-wrap shrink-0" style={{ borderTop: "1px solid var(--c-border-2)" }}>
          {pendingFiles.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]"
              style={{ background: "var(--c-bg-card)", color: "var(--c-text-3)" }}>
              {f.type.startsWith("image/") ? (
                <img
                  src={f.dataUrl}
                  alt={f.name}
                  onClick={() => onImageClick(f.dataUrl)}
                  className="h-8 w-8 rounded object-cover shrink-0 cursor-pointer"
                  style={{ transition: "opacity 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--c-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.boxShadow = "none"; }}
                />
              ) : (
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              )}
              <span className="truncate max-w-[120px]">{f.name}</span>
              <span style={{ color: "var(--c-text-5)" }}>({(f.size / 1024).toFixed(0)}kb)</span>
              <button onClick={() => onRemovePendingFile(f.id)} className="text-red-400/40 hover:text-red-400" aria-label="Remove file">&times;</button>
            </div>
          ))}
        </div>
      )}

      {/* Follow-up suggestion chips */}
      {suggestions.length > 0 && !streaming && (
        <div className="px-2 sm:px-4 py-2 shrink-0 flex flex-wrap gap-2 justify-center max-w-3xl mx-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-chip text-xs px-3 py-1.5 rounded-full transition-all"
              style={{
                background: "transparent",
                color: "var(--c-text-2)",
                border: "1px solid var(--c-border-2)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--c-bg-hover)";
                e.currentTarget.style.borderColor = "var(--c-accent)";
                e.currentTarget.style.color = "var(--c-text-1)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--c-border-2)";
                e.currentTarget.style.color = "var(--c-text-2)";
                e.currentTarget.style.transform = "none";
              }}
              onClick={() => onSelectSuggestion(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="px-2 sm:px-4 py-1 shrink-0 mobile-safe-bottom mobile-input-sticky mobile-input-area relative" style={{ background: "var(--c-bg-2)", borderTop: "1px solid var(--c-border-2)" }}>
        {/* ARIA live region for voice status announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">{voiceAnnouncement}</div>

        <input ref={fileRef} type="file" multiple className="hidden" onChange={onFileSelect} aria-label="Upload files" tabIndex={-1} />

        {/* Slash command dropdown */}
        {slashOpen && slashFiltered.length > 0 && (
          <div
            ref={slashRef}
            className="max-w-3xl mx-auto mb-1 rounded-lg overflow-hidden shadow-lg"
            style={{
              background: "var(--c-bg-2)",
              border: "1px solid var(--c-border-2)",
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--c-text-4)", borderBottom: "1px solid var(--c-border-1)" }}>
              Commands
            </div>
            {slashFiltered.map((cmd, i) => (
              <button
                key={cmd.name}
                data-slash-active={i === slashIndex ? "true" : "false"}
                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                style={{
                  background: i === slashIndex ? "var(--c-bg-hover)" : "transparent",
                  color: "var(--c-text-1)",
                }}
                onMouseEnter={() => setSlashIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSlashSelect(cmd.name.startsWith("model ") ? cmd.name : input.slice(1));
                }}
              >
                <span className="flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-bold" style={{ background: "var(--c-bg-3)", color: "var(--c-accent)" }}>
                  /
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{cmd.name.startsWith("model ") ? cmd.name : cmd.usage}</div>
                  <div className="text-xs truncate" style={{ color: "var(--c-text-4)" }}>{cmd.description}</div>
                </div>
                {i === slashIndex && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--c-bg-3)", color: "var(--c-text-4)" }}>
                    Enter
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className="max-w-3xl mx-auto overflow-hidden transition-all"
          id="shre-input-box"
        >
          {/* Reply preview bar */}
          {replyToIndex !== null && replyToContent && (
            <div
              className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg mb-1"
              style={{ background: 'var(--c-bg-3)', color: 'var(--c-text-3)' }}
            >
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              <span className="flex-1 truncate" style={{ color: 'var(--c-text-4)' }}>
                Replying to: {replyToContent.replace(/\n/g, " ").slice(0, 60)}
                {replyToContent.length > 60 ? '...' : ''}
              </span>
              <button
                onClick={onCancelReply}
                className="p-0.5 rounded transition-colors hover:brightness-125"
                style={{ color: 'var(--c-text-5)' }}
                title="Cancel reply"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* Editing indicator */}
          {(editingMsgIndex !== null || editingQueueId !== null) && (
            <div className="flex items-center gap-2 px-2 py-1 text-[11px] rounded-lg mb-1" style={{ background: "var(--c-bg-active)", color: "var(--c-accent)" }}>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>{editingQueueId ? "Editing queue item — press Enter to save, Escape to cancel" : "Editing message — press Enter to resend, Escape to cancel"}</span>
              <button
                onClick={onCancelEdit}
                className="ml-auto p-0.5 rounded hover:opacity-80"
                style={{ color: "var(--c-text-3)" }}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          {/* Textarea */}
          <textarea
            id="shre-chat-textarea"
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={!writeEnabled ? "Read-only mode — enable Write in settings" : syncing && messages.length === 0 ? "Syncing history..." : compareMode ? `Compare ${compareModelsCount} models...` : streaming ? `Queue a task for ${currentAgentName}...` : cliMode ? "Claude CLI (subscription mode)..." : `Message ${currentAgentName}...`}
            disabled={(syncing && messages.length === 0) || !writeEnabled}
            rows={1}
            aria-label="Message input"
            className="w-full px-4 pt-3 pb-1 text-sm resize-none focus:outline-none disabled:opacity-50 max-h-60 overflow-y-auto bg-transparent"
            style={{ color: "var(--c-text-1)", minHeight: "44px" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "36px";
              el.style.height = Math.min(el.scrollHeight, 240) + "px";
            }}
          />

          {/* Toolbar row */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex items-center gap-0.5">
              {/* Attach */}
              <button
                onClick={() => fileRef.current?.click()}
                className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
                style={{ color: "var(--c-text-2)" }}
                title="Attach file"
                aria-label="Attach file"
              >
                <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
              </button>

              {/* Emoji */}
              <div className="relative" ref={emojiRef}>
                <button
                  onClick={() => setShowEmoji(!showEmoji)}
                  className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
                  style={{ color: showEmoji ? "var(--c-accent)" : "var(--c-text-2)" }}
                  title="Emoji"
                  aria-label="Insert emoji"
                >
                  <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                {showEmoji && (
                  <div className="fixed sm:absolute bottom-16 sm:bottom-9 left-2 sm:left-0 right-2 sm:right-auto z-50 flex justify-center sm:justify-start">
                    <ViewErrorBoundary viewName="Emoji Picker">
                      <Suspense fallback={<div style={{ width: 320, height: 350, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-card)", borderRadius: 8, color: "var(--text-secondary)" }}>Loading…</div>}>
                        <EmojiPicker
                          theme="dark"
                          onEmojiSelect={(emoji: any) => {
                            setInput(input + emoji.native);
                            inputRef.current?.focus();
                            setShowEmoji(false);
                          }}
                          previewPosition="none"
                          skinTonePosition="search"
                          dynamicWidth={typeof window !== "undefined" && window.innerWidth < 640}
                        />
                      </Suspense>
                    </ViewErrorBoundary>
                  </div>
                )}
              </div>

              {/* Mic button */}
              {speechSupported && (
                <button
                  onClick={isRecording ? onStopRecording : onStartRecording}
                  className={`relative h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${isRecording && voicePhase === "recording" ? "bg-red-500/20 text-red-400" : voicePhase === "transcribing" ? "bg-blue-500/20 text-blue-400" : ""}`}
                  style={isRecording ? {} : { color: "var(--c-text-2)" }}
                  title={isRecording ? "Tap to stop" : "Voice input"}
                  aria-label={isRecording ? "Stop recording" : "Voice input"}
                >
                  {voicePhase === "transcribing" ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                  ) : isRecording ? (
                    <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  )}
                  {isRecording && voicePhase === "recording" && (
                    <span
                      className="absolute inset-0 rounded-lg pointer-events-none"
                      style={{
                        boxShadow: `0 0 ${4 + audioLevel * 16}px ${1 + audioLevel * 4}px rgba(239, 68, 68, ${0.2 + audioLevel * 0.5})`,
                        transition: "box-shadow 100ms ease-out",
                      }}
                    />
                  )}
                </button>
              )}

              {/* Hands-free toggle */}
              {hasSpeechRecognition && (
                <button
                  onClick={() => setIsHandsFree(!isHandsFree)}
                  className={`h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${isHandsFree ? "bg-green-500/20 text-green-400" : ""}`}
                  style={isHandsFree ? {} : { color: "var(--c-text-2)" }}
                  title={isHandsFree ? 'Hands-free ON — say "shre shre" to start' : "Enable hands-free mode"}
                  aria-label={isHandsFree ? "Disable hands-free mode" : "Enable hands-free mode"}
                >
                  <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><circle cx="12" cy="12" r="10" strokeDasharray="4 4"/></svg>
                </button>
              )}

              {/* Voice mode */}
              {speechSupported && (
                <button
                  onClick={() => {
                    const next = !voiceMode;
                    setVoiceMode(next);
                    if (!next) onStopTTS();
                  }}
                  className={`h-10 w-10 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${voiceMode ? "bg-blue-500/20 text-blue-400" : ""}`}
                  style={voiceMode ? {} : { color: "var(--c-text-2)" }}
                  title={voiceMode ? "Voice mode ON — responses will be spoken" : "Enable voice mode (auto-speak responses)"}
                  aria-label={voiceMode ? "Disable voice mode" : "Enable voice mode"}
                >
                  <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill={voiceMode ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                </button>
              )}

              {/* TTS voice selector */}
              {voiceMode && (
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="h-7 sm:h-6 rounded text-[10px] px-1 border-none outline-none cursor-pointer hidden sm:block"
                  style={{ background: "var(--c-bg-hover, rgba(255,255,255,0.08))", color: "var(--c-text-2)", minWidth: 56 }}
                  title="TTS voice"
                  aria-label="Select TTS voice"
                >
                  <option value="alloy">Alloy</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="nova">Nova</option>
                  <option value="onyx">Onyx</option>
                  <option value="shimmer">Shimmer</option>
                </select>
              )}

              {/* Terminal toggle */}
              <button
                onClick={onToggleTerminal}
                className={`h-8 sm:h-8 rounded-lg flex items-center gap-1.5 px-2 text-xs transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${showTerminal ? "bg-violet-500/20 text-violet-400" : ""}`}
                style={showTerminal ? {} : { color: "var(--c-text-2)" }}
                title={showTerminal ? "Close terminal" : "Open terminal"}
                aria-label={showTerminal ? "Close terminal" : "Open terminal"}
              >
                <svg className="h-4 w-4 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              </button>

              {/* View mode toggle */}
              {showTerminal && (
                <button
                  onClick={onToggleTermViewMode}
                  className="h-7 rounded-lg flex items-center px-1.5 text-[10px] transition-all hover:brightness-125"
                  style={{ color: termViewMode === "tabs" ? "var(--c-terminal-accent)" : "var(--c-text-2)" }}
                  title={termViewMode === "split" ? "Switch to tab view" : "Switch to split view"}
                >
                  {termViewMode === "split" ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18"/><path d="M9 6v4"/><path d="M15 6v4"/></svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
                  )}
                </button>
              )}

              {/* Voice status indicators */}
              {isRecording && voicePhase === "waiting" && (
                <span className="text-xs text-yellow-400 flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  Say "shre shre" to start
                </span>
              )}
              {isRecording && voicePhase === "recording" && (
                <span className="text-xs text-red-400 flex items-center gap-1.5 ml-1">
                  <span className="flex items-end gap-px h-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="w-[2px] rounded-full bg-red-400" style={{ height: `${Math.max(3, (audioLevel * 12 * (0.6 + Math.sin(Date.now() / 150 + i * 1.2) * 0.4)))}px`, transition: "height 120ms ease-out" }} />
                    ))}
                  </span>
                  <span className="tabular-nums">{Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, "0")}</span>
                  {recordingDuration >= MAX_RECORDING_SECONDS - 30 ? (
                    <span className="text-yellow-400 animate-pulse hidden sm:inline">Stopping soon...</span>
                  ) : (
                    <span className="hidden sm:inline opacity-70">Tap to stop</span>
                  )}
                </span>
              )}
              {voicePhase === "transcribing" && (
                <span className="text-xs text-blue-400 flex items-center gap-1.5 ml-1 animate-pulse">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                  Transcribing...
                </span>
              )}
              {isSpeaking && !isRecording && (
                <span className="text-xs text-blue-400 flex items-center gap-1 ml-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
                  Speaking...
                </span>
              )}
              {!isRecording && !voicePhase.startsWith("trans") && interimTranscript && (
                <span className="text-xs flex items-center gap-1 ml-1 max-w-[200px] sm:max-w-none" style={{ color: interimTranscript.includes("failed") || interimTranscript.includes("blocked") || interimTranscript.includes("timed") || interimTranscript.includes("error") ? "#f87171" : "var(--c-text-4)" }}>
                  <span className="truncate">{interimTranscript}</span>
                </span>
              )}
              {isHandsFree && !isRecording && !interimTranscript && (
                <span className="text-xs flex items-center gap-1 ml-1" style={{ color: "var(--c-text-5)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Listening...
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Input token count */}
              {input.trim() && (
                <span className="text-[10px]" style={{ color: "var(--c-text-5)" }}>
                  {formatTokenCount(estimateTokens(input))}
                </span>
              )}
              {/* Stop button */}
              {streaming && (
                <button
                  onClick={onAbort}
                  className="h-7 w-7 rounded-lg flex items-center justify-center transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
                  title="Stop"
                  aria-label="Stop generating"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </button>
              )}
              {/* Send button */}
              <div className="relative">
                <button
                  data-send-btn
                  onClick={onSend}
                  className="h-7 w-7 rounded-lg flex items-center justify-center transition-all focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
                  style={
                    input.trim() && !syncing
                      ? { background: streaming ? "var(--c-accent-soft)" : "var(--c-accent)", color: streaming ? "var(--c-accent)" : "var(--c-on-accent)" }
                      : { color: "var(--c-text-4)" }
                  }
                  disabled={!input.trim() || syncing || !writeEnabled}
                  title={!writeEnabled ? "Read-only mode — enable Write in settings" : streaming ? `Add to queue${queueCount ? ` (${queueCount} queued)` : ""}` : "Send"}
                  aria-label={streaming ? "Add to queue" : "Send message"}
                >
                  {streaming ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  )}
                </button>
                {queueCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-1"
                    style={{ background: "var(--c-warning)", color: "var(--c-on-dark)" }}>
                    {queueCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
