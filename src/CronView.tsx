import { useState, useEffect } from 'react';
import { useApp } from './store';
import { SBadge } from '@shre/ui-kit';
import ports from '../../ports.json';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  interval: string;
  service: string;
  category: 'always-on' | 'interval' | 'daily' | 'crontab' | 'internal';
  description: string;
  port?: number;
  status?: 'running' | 'stopped' | 'unknown';
}

// Static cron job registry — matches the actual Shre ecosystem
const CRON_JOBS: CronJob[] = [
  // Always-on services
  {
    id: 'auth',
    name: 'shre-auth',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.auth',
    category: 'always-on',
    description: 'Authentication service',
    port: ports.services['shre-auth'].port,
  },
  {
    id: 'chat',
    name: 'shre-chat',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.chat',
    category: 'always-on',
    description: 'Chat UI (this app)',
    port: ports.services['shre-chat'].port,
  },
  {
    id: 'chronicle',
    name: 'shre-chronicle',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.chronicle',
    category: 'always-on',
    description: 'Event stream & audit trail',
    port: ports.services['shre-chronicle'].port,
  },
  {
    id: 'contacts',
    name: 'shre-contacts',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.contacts',
    category: 'always-on',
    description: 'Contact management',
    port: ports.services['shre-contacts'].port,
  },
  {
    id: 'cortex-bridge',
    name: 'cortex-bridge',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.cortex-bridge',
    category: 'always-on',
    description: 'CortexDB bridge & sync',
    port: ports.services['shre-cortex-bridge'].port,
  },
  {
    id: 'meter',
    name: 'shre-meter',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.meter',
    category: 'always-on',
    description: 'Usage metering',
    port: ports.services['shre-meter'].port,
  },
  {
    id: 'monitor',
    name: 'shre-monitor',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.monitor',
    category: 'always-on',
    description: 'Health monitoring (9 modules)',
    port: ports.services['shre-monitor'].port,
  },
  {
    id: 'router',
    name: 'shre-router',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.router',
    category: 'always-on',
    description: 'Model routing (10 gates + LLaMA)',
    port: ports.services['shre-router'].port,
  },
  {
    id: 'scorer',
    name: 'shre-scorer',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.scorer',
    category: 'always-on',
    description: 'Quality scoring',
    port: ports.services['shre-scorer'].port,
  },
  {
    id: 'skills',
    name: 'shre-skills',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.skills',
    category: 'always-on',
    description: 'Skill registry',
    port: ports.services['shre-skills'].port,
  },
  {
    id: 'status',
    name: 'shre-doctor',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.status',
    category: 'always-on',
    description: 'System status dashboard',
    port: ports.services['shre-doctor'].port,
  },
  {
    id: 'tasks',
    name: 'shre-tasks',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.tasks',
    category: 'always-on',
    description: 'Task queue & scheduling',
    port: ports.services['shre-tasks'].port,
  },
  {
    id: 'traffic',
    name: 'shre-traffic',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.traffic',
    category: 'always-on',
    description: 'Traffic analysis',
    port: ports.services['shre-traffic'].port,
  },
  {
    id: 'mib-web',
    name: 'MIB007 Web',
    schedule: 'KeepAlive',
    interval: 'always',
    service: 'ai.shre.mib-web',
    category: 'always-on',
    description: 'MIB007 dashboard',
    port: ports.services['mib007'].port,
  },

  // Interval-based
  {
    id: 'argus',
    name: 'Argus',
    schedule: '*/15min',
    interval: '15 min',
    service: 'ai.shre.argus',
    category: 'interval',
    description: 'System health & diagnostics',
  },
  {
    id: 'medic',
    name: 'Medic',
    schedule: '*/5min',
    interval: '5 min',
    service: 'ai.shre.medic',
    category: 'interval',
    description: 'Service health checks & auto-remediation',
  },
  {
    id: 'memo',
    name: 'Memo',
    schedule: '*/30min',
    interval: '30 min',
    service: 'ai.shre.memo',
    category: 'interval',
    description: 'Memory & context consolidation',
  },
  {
    id: 'network-tracer',
    name: 'Network Tracer',
    schedule: '*/3min',
    interval: '3 min',
    service: 'ai.shre.network-tracer',
    category: 'interval',
    description: 'Network diagnostics & traffic analysis',
  },
  {
    id: 'ollama-watchdog',
    name: 'Ollama Watchdog',
    schedule: '*/5min',
    interval: '5 min',
    service: 'ai.shre.ollama-watchdog',
    category: 'interval',
    description: 'Monitor & restart Ollama if down',
  },
  {
    id: 'restore',
    name: 'Auto Snapshot',
    schedule: '*/6hr',
    interval: '6 hr',
    service: 'ai.shre.restore',
    category: 'interval',
    description: 'System snapshots for recovery',
  },

  // Daily scheduled
  {
    id: 'backup',
    name: 'Database Backup',
    schedule: '02:00',
    interval: 'daily',
    service: 'ai.shre.backup',
    category: 'daily',
    description: 'Full database backup',
  },
  {
    id: 'retention',
    name: 'Data Retention',
    schedule: '03:00',
    interval: 'daily',
    service: 'ai.shre.retention',
    category: 'daily',
    description: 'Cleanup: 90d soft delete, 1yr hard delete',
  },
  {
    id: 'router-eval',
    name: 'Router Eval',
    schedule: '03:00',
    interval: 'daily',
    service: 'ai.shre.router-eval',
    category: 'daily',
    description: 'Router performance evaluation',
  },

  // Crontab
  {
    id: 'cron-ingest',
    name: 'Cortex Ingestion',
    schedule: '*/30 * * * *',
    interval: '30 min',
    service: 'crontab',
    category: 'crontab',
    description: 'Ingest OpenClaw sessions into CortexDB',
  },
  {
    id: 'cron-consolidate',
    name: 'Memory Consolidate',
    schedule: '0 */6 * * *',
    interval: '6 hr',
    service: 'crontab',
    category: 'crontab',
    description: 'Ebbinghaus decay consolidation',
  },
  {
    id: 'cron-health-bridge',
    name: 'Bridge Health',
    schedule: '*/15 * * * *',
    interval: '15 min',
    service: 'crontab',
    category: 'crontab',
    description: 'cortex-bridge health check',
  },
  {
    id: 'cron-health-argus',
    name: 'Argus Health',
    schedule: '*/15 * * * *',
    interval: '15 min',
    service: 'crontab',
    category: 'crontab',
    description: 'Argus launcher health check',
  },

  // Internal service schedules
  {
    id: 'int-service-monitor',
    name: 'Service Monitor',
    schedule: '30s loop',
    interval: '30 sec',
    service: 'shre-monitor',
    category: 'internal',
    description: 'Service availability checks',
  },
  {
    id: 'int-memory-monitor',
    name: 'Memory Monitor',
    schedule: '2m loop',
    interval: '2 min',
    service: 'shre-monitor',
    category: 'internal',
    description: 'Memory usage & leak detection',
  },
  {
    id: 'int-anomaly',
    name: 'Anomaly Detector',
    schedule: '2m loop',
    interval: '2 min',
    service: 'shre-monitor',
    category: 'internal',
    description: 'System anomaly detection',
  },
  {
    id: 'int-db-monitor',
    name: 'DB Monitor',
    schedule: '5m loop',
    interval: '5 min',
    service: 'shre-monitor',
    category: 'internal',
    description: 'Database health & connections',
  },
  {
    id: 'int-cost-monitor',
    name: 'Cost Monitor',
    schedule: '10m loop',
    interval: '10 min',
    service: 'shre-monitor',
    category: 'internal',
    description: 'API cost tracking',
  },
  {
    id: 'int-chronicle',
    name: 'Chronicle Monitor',
    schedule: '1m loop',
    interval: '1 min',
    service: 'shre-monitor',
    category: 'internal',
    description: 'Event stream health',
  },
  {
    id: 'int-pipeline',
    name: 'Pipeline Monitor',
    schedule: '15m loop',
    interval: '15 min',
    service: 'shre-monitor',
    category: 'internal',
    description: 'AI pipeline execution monitor',
  },
  {
    id: 'int-skills-audit',
    name: 'Skills Auditor',
    schedule: '1h loop',
    interval: '1 hr',
    service: 'shre-monitor',
    category: 'internal',
    description: 'Skill endpoint audit',
  },
  {
    id: 'int-tools-audit',
    name: 'Tools Auditor',
    schedule: '1h loop',
    interval: '1 hr',
    service: 'shre-monitor',
    category: 'internal',
    description: 'Tool configuration audit',
  },
  {
    id: 'int-queue-drain',
    name: 'Queue Drainer',
    schedule: '30s loop',
    interval: '30 sec',
    service: 'shre-tasks',
    category: 'internal',
    description: 'Drain queued tasks (batch of 5)',
  },
  {
    id: 'int-task-retention',
    name: 'Task Retention',
    schedule: '02:00 cron',
    interval: 'daily',
    service: 'shre-tasks',
    category: 'internal',
    description: 'Purge old completed tasks',
  },
  {
    id: 'int-finetune',
    name: 'Finetune Watcher',
    schedule: '60s loop',
    interval: '60 sec',
    service: 'shre-finetune',
    category: 'internal',
    description: 'Poll MIB007 for finetune data',
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  'always-on': { label: 'Always-On Services', color: 'text-emerald-400' },
  interval: { label: 'Interval Jobs', color: 'text-amber-400' },
  daily: { label: 'Daily Scheduled', color: 'text-blue-400' },
  crontab: { label: 'Crontab', color: 'text-purple-400' },
  internal: { label: 'Internal Schedules', color: 'text-cyan-400' },
};

export function CronView() {
  const { state, actions } = useApp();
  const [serviceStatus, setServiceStatus] = useState<
    Record<string, 'running' | 'stopped' | 'unknown'>
  >({});
  const [loading, setLoading] = useState(true);

  // Check which always-on services are actually running
  useEffect(() => {
    async function checkServices() {
      const checks: Promise<[string, 'running' | 'stopped']>[] = CRON_JOBS.filter(
        (j) => j.port,
      ).map(async (j): Promise<[string, 'running' | 'stopped']> => {
        try {
          await fetch(`http://127.0.0.1:${j.port}/`, {
            signal: AbortSignal.timeout(1500),
            mode: 'no-cors',
          });
          return [j.id, 'running'];
        } catch {
          return [j.id, 'stopped'];
        }
      });

      const results = await Promise.all(checks);
      const status: Record<string, 'running' | 'stopped'> = {};
      for (const [id, s] of results) status[id] = s;
      setServiceStatus(status);
      setLoading(false);
    }
    checkServices();
    const iv = setInterval(checkServices, 30_000);
    return () => clearInterval(iv);
  }, []);

  const grouped = new Map<string, CronJob[]>();
  for (const job of CRON_JOBS) {
    if (!grouped.has(job.category)) grouped.set(job.category, []);
    grouped.get(job.category)!.push(job);
  }

  const runningCount = Object.values(serviceStatus).filter((s) => s === 'running').length;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <header
        className="flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-sm"
        style={{ background: 'var(--c-bg-glass)', borderBottom: '1px solid var(--c-border-1)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
            style={{ color: 'var(--c-text-4)' }}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>
            Cron Jobs
          </h1>
          <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
            {CRON_JOBS.length} jobs
          </span>
          {!loading && (
            <span className="text-[10px] text-emerald-400/60">{runningCount} services up</span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-6 max-w-3xl mx-auto">
          {Array.from(grouped.entries()).map(([cat, jobs]) => {
            const cfg = CATEGORY_LABELS[cat]!;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
                    {jobs.length}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {jobs.map((job) => {
                    const status = serviceStatus[job.id] || 'unknown';
                    return (
                      <div
                        key={job.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
                        style={{ background: 'transparent' }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'var(--c-bg-hover)')
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {job.category === 'always-on' ? (
                          <SBadge
                            variant={
                              status === 'running'
                                ? 'success'
                                : status === 'stopped'
                                  ? 'destructive'
                                  : 'warning'
                            }
                            className="text-[8px] px-1.5 py-0 h-4 shrink-0"
                          >
                            {status === 'running' ? 'up' : status === 'stopped' ? 'down' : '?'}
                          </SBadge>
                        ) : (
                          <span className="h-2 w-2 rounded-full shrink-0 bg-blue-500/30" />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-medium"
                              style={{ color: 'var(--c-text-2)' }}
                            >
                              {job.name}
                            </span>
                            {job.port && (
                              <span
                                className="text-[9px] font-mono"
                                style={{ color: 'var(--c-text-5)' }}
                              >
                                :{job.port}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
                            {job.description}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className="text-[10px] font-mono"
                            style={{ color: 'var(--c-text-3)' }}
                          >
                            {job.schedule}
                          </span>
                          <div className="text-[9px]" style={{ color: 'var(--c-text-5)' }}>
                            {job.interval}
                          </div>
                        </div>

                        <span
                          className="text-[9px] font-mono shrink-0 w-24 text-right truncate hidden lg:block"
                          style={{ color: 'var(--c-text-5)' }}
                        >
                          {job.service}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
