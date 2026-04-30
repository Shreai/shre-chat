import { useMemo, type ReactNode } from 'react';
import { useApp, type UploadedFile } from './store';
import { useFileHandling } from './hooks/useFileHandling';
import { DragOverlay } from './components/DragOverlay';
import type { AuthUser } from './AppAuth';
import type { UserProfile } from './store';

const DOC_SESSION_ID = 'documents';
const DOC_SESSION_TITLE = 'Document Inbox';
const DOC_AGENT_ID = 'shre';

interface DocumentsViewProps {
  authUser: AuthUser;
  userProfile: UserProfile;
  onLogout: () => void;
}

export function DocumentsView({ authUser, userProfile, onLogout }: DocumentsViewProps) {
  const { state, actions } = useApp();
  const { files } = state;
  const documents = useMemo(
    () =>
      files
        .filter((file) => file.sessionId === DOC_SESSION_ID || file.sessionTitle === DOC_SESSION_TITLE)
        .slice()
        .sort((a, b) => b.uploadedAt - a.uploadedAt),
    [files],
  );

  const totalBytes = documents.reduce((sum, file) => sum + file.size, 0);
  const imageCount = documents.filter((file) => file.type.startsWith('image/')).length;
  const otherCount = documents.filter((file) => !file.type.startsWith('image/')).length;

  const {
    pendingFiles,
    setPendingFiles,
    isDragging,
    fileRef,
    handleFileSelect,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    removePendingFile,
  } = useFileHandling({
    activeSessionId: DOC_SESSION_ID,
    activeSessionTitle: DOC_SESSION_TITLE,
    activeAgentId: DOC_AGENT_ID,
    actions,
  });

  const persistPendingFiles = () => {
    if (pendingFiles.length === 0) return;
    for (const file of pendingFiles) {
      actions.addFile({
        ...file,
        sessionId: DOC_SESSION_ID,
        sessionTitle: DOC_SESSION_TITLE,
        agentId: DOC_AGENT_ID,
      });
    }
    setPendingFiles([]);
    actions.setStatusLine(`Uploaded ${pendingFiles.length} document${pendingFiles.length === 1 ? '' : 's'}`);
    setTimeout(() => actions.setStatusLine(null), 2500);
  };

  const openFile = (file: UploadedFile) => {
    window.open(file.dataUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(99,141,255,0.16), transparent 28%), radial-gradient(circle at bottom right, rgba(52,211,153,0.12), transparent 22%), var(--c-bg-1)',
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DragOverlay isDragging={isDragging} />

      <header
        className="shrink-0 px-4 sm:px-6 py-4 sm:py-5 border-b"
        style={{ background: 'rgba(10,10,12,0.55)', borderColor: 'var(--c-border-2)' }}
      >
        <div className="max-w-7xl mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.35em]" style={{ color: 'var(--c-text-4)' }}>
              Shre Documents
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
              Upload, organize, and share files
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: 'var(--c-text-3)' }}>
              Signed in as <strong style={{ color: 'var(--c-text-1)' }}>{authUser.name}</strong>.
              Your profile is saved, so onboarding will not repeat on the next visit.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] sm:text-xs">
            <Badge>{userProfile.business.name || 'No business profile yet'}</Badge>
            <Badge>{authUser.role}</Badge>
            <Badge>{documents.length} docs</Badge>
            <Badge>{formatBytes(totalBytes)}</Badge>
            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-full font-medium transition-colors"
              style={{ background: 'var(--c-bg-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border-2)' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <section
              className="rounded-3xl border p-4 sm:p-6"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--c-border-2)' }}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
                    Upload documents
                  </h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
                    Drop files anywhere on the page or pick them manually.
                  </p>
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 rounded-full font-medium text-sm transition-colors"
                  style={{ background: 'var(--c-accent)', color: '#fff' }}
                >
                  Choose files
                </button>
              </div>

              <div
                className="rounded-3xl border-2 border-dashed p-5 sm:p-8 flex flex-col gap-5 items-center justify-center text-center"
                style={{
                  minHeight: '280px',
                  borderColor: isDragging ? 'var(--c-accent)' : 'var(--c-border-2)',
                  background: isDragging ? 'rgba(99,141,255,0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  aria-label="Upload documents"
                />

                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,141,255,0.12)' }}>
                  <svg
                    className="h-7 w-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ color: 'var(--c-accent)' }}
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>

                <div>
                  <h3 className="text-xl font-semibold" style={{ color: 'var(--c-text-1)' }}>
                    Drop PDFs, images, spreadsheets, or text files here
                  </h3>
                  <p className="mt-2 text-sm max-w-xl" style={{ color: 'var(--c-text-3)' }}>
                    We keep your uploads in a document inbox so the page stays focused on files
                    instead of chat. Great for mobile and foldable screens.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 text-[11px] sm:text-xs">
                  <Badge>PDF</Badge>
                  <Badge>PNG / JPG</Badge>
                  <Badge>CSV / XLSX</Badge>
                  <Badge>DOC / TXT</Badge>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="px-5 py-3 rounded-2xl font-medium text-sm transition-colors"
                    style={{ background: 'var(--c-bg-2)', color: 'var(--c-text-1)', border: '1px solid var(--c-border-2)' }}
                  >
                    Browse files
                  </button>
                  <button
                    onClick={persistPendingFiles}
                    disabled={pendingFiles.length === 0}
                    className="px-5 py-3 rounded-2xl font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--c-accent)', color: '#fff' }}
                  >
                    Upload {pendingFiles.length > 0 ? `${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'}` : 'files'}
                  </button>
                </div>
              </div>

              {pendingFiles.length > 0 && (
                <div className="mt-4 rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--c-border-2)' }}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="font-medium" style={{ color: 'var(--c-text-1)' }}>
                      Ready to upload
                    </h3>
                    <button
                      onClick={() => setPendingFiles([])}
                      className="text-sm"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-2">
                    {pendingFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2"
                        style={{ background: 'var(--c-bg-2)' }}
                      >
                        <FileIcon type={file.type} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm" style={{ color: 'var(--c-text-1)' }}>
                            {file.name}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                            {formatBytes(file.size)}
                          </div>
                        </div>
                        <button
                          onClick={() => removePendingFile(file.id)}
                          className="text-red-400 text-lg leading-none"
                          aria-label={`Remove ${file.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="grid gap-5">
              <section
                className="rounded-3xl border p-4 sm:p-6"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--c-border-2)' }}
              >
                <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--c-text-1)' }}>
                  Inbox at a glance
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Documents" value={documents.length.toString()} />
                  <MetricCard label="Images" value={imageCount.toString()} />
                  <MetricCard label="Files total" value={documents.length.toString()} />
                  <MetricCard label="Other docs" value={otherCount.toString()} />
                  <MetricCard label="Storage" value={formatBytes(totalBytes)} />
                </div>
              </section>

              <section
                className="rounded-3xl border p-4 sm:p-6"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--c-border-2)' }}
              >
                <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--c-text-1)' }}>
                  Recent uploads
                </h2>
                {documents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-5 text-sm" style={{ color: 'var(--c-text-4)' }}>
                    No documents yet. Upload a PDF, CSV, screenshot, or note to get started.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {documents.slice(0, 12).map((file) => (
                      <div
                        key={file.id}
                        className="rounded-2xl border px-3 py-3 flex items-start gap-3"
                        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--c-border-2)' }}
                      >
                        <FileIcon type={file.type} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" style={{ color: 'var(--c-text-1)' }}>
                            {file.name}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                            {formatBytes(file.size)} · {new Date(file.uploadedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => openFile(file)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-medium"
                              style={{ background: 'var(--c-bg-2)', color: 'var(--c-text-1)', border: '1px solid var(--c-border-2)' }}
                            >
                              Open
                            </button>
                            <button
                              onClick={() => actions.removeFile(file.id)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-medium"
                              style={{ background: 'rgba(248,113,113,0.08)', color: 'var(--c-danger)' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1"
      style={{ background: 'var(--c-bg-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border-2)' }}
    >
      {children}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--c-border-2)' }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--c-text-4)' }}>
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--c-text-1)' }}>
        {value}
      </div>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  const isImage = type.startsWith('image/');
  const isPdf = type === 'application/pdf';
  const color = isImage ? 'var(--c-accent)' : isPdf ? '#ef4444' : 'var(--c-success)';
  return (
    <div
      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'var(--c-bg-2)', color }}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
