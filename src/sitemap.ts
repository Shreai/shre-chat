/**
 * Shre Chat Sitemap — canonical view registry for agent deep-linking.
 *
 * Agents use `window.dispatchEvent(new CustomEvent("shre:switch-view", { detail: viewId }))`
 * to navigate users directly to any section. The sitemap is also served via GET /api/sitemap
 * for programmatic discovery.
 */

import { mib007Link } from './chat-utils';
import type { View } from './store';

export interface SitemapEntry {
  /** View ID (matches the View type) */
  id: View | string;
  /** Human-readable label */
  label: string;
  /** Short description for agent context */
  description: string;
  /** Category grouping */
  category: 'work' | 'analytics' | 'apps' | 'tools' | 'external';
  /** Whether this is an in-app view or external link */
  type: 'view' | 'external';
  /** For external links, the target URL */
  url?: string;
  /** Keywords agents can match against */
  keywords: string[];
}

export const SITEMAP: SitemapEntry[] = [
  // ── Work ──
  {
    id: 'chat',
    label: 'Chat',
    description: 'AI chat with Shre and agents — ask questions, get insights, manage store',
    category: 'work',
    type: 'view',
    keywords: ['chat', 'ask', 'message', 'talk', 'conversation', 'ai'],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description:
      'View and manage all tasks — filter by status, priority, agent. Quick actions to start, complete, approve tasks.',
    category: 'work',
    type: 'view',
    keywords: ['tasks', 'todo', 'to-do', 'action items', 'work items', 'assignments', 'pending'],
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Browse projects with their associated tasks — filter by active, paused, archived',
    category: 'work',
    type: 'view',
    keywords: ['projects', 'initiatives', 'workstreams', 'goals'],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    description:
      'Personal reminders with natural language input, recurring schedules, snooze, and due alerts',
    category: 'work',
    type: 'view',
    keywords: ['reminders', 'remind me', 'alerts', 'notifications', 'schedule', 'due'],
  },
  {
    id: 'task-timeline',
    label: 'Task Timeline',
    description:
      'Gantt chart visualization of tasks over time — see task durations, dependencies, agent assignments',
    category: 'work',
    type: 'view',
    keywords: ['timeline', 'gantt', 'schedule', 'task chart', 'calendar'],
  },
  {
    id: 'briefing',
    label: 'Briefing',
    description: 'Morning briefing — pending tasks, active agents, recent activity summary',
    category: 'work',
    type: 'view',
    keywords: ['briefing', 'morning', 'summary', 'digest', 'status', 'overview'],
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Activity log — recent actions, agent events, system events',
    category: 'work',
    type: 'view',
    keywords: ['activity', 'log', 'history', 'events', 'recent'],
  },

  // ── Analytics ──
  {
    id: 'feed',
    label: 'Feed',
    description: 'Real-time activity feed — gateway message flow, agent actions, routing events',
    category: 'analytics',
    type: 'view',
    keywords: ['feed', 'live', 'stream', 'events', 'gateway'],
  },
  {
    id: 'feed-analytics',
    label: 'Feed Analytics',
    description: 'Charts and metrics for feed events — by agent, category, severity over time',
    category: 'analytics',
    type: 'view',
    keywords: ['analytics', 'charts', 'metrics', 'feed stats', 'event analysis'],
  },
  {
    id: 'cost-dashboard',
    label: 'Cost Dashboard',
    description: 'AI cost tracking — spend by model, by agent, over time, budget status',
    category: 'analytics',
    type: 'view',
    keywords: ['costs', 'spend', 'budget', 'billing', 'usage', 'tokens', 'pricing'],
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Schedule and manage automated reports — daily/weekly/monthly delivery via AI',
    category: 'analytics',
    type: 'view',
    keywords: ['reports', 'scheduled', 'email', 'automated', 'daily report'],
  },
  {
    id: 'employee-activity',
    label: 'Employee Activity',
    description: 'Employee activity tracking and monitoring',
    category: 'analytics',
    type: 'view',
    keywords: ['employees', 'staff', 'team', 'workforce'],
  },

  // ── Apps ──
  {
    id: 'marketplace',
    label: 'Marketplace',
    description: 'Browse and manage agent marketplace — agent catalog, quality scores, costs',
    category: 'apps',
    type: 'view',
    keywords: ['marketplace', 'agents', 'catalog', 'install', 'apps', 'store'],
  },

  // ── Tools ──
  {
    id: 'agent-trace',
    label: 'Agent Trace',
    description:
      'Live agent execution traceroute — see what each agent is doing, timing per step, errors, queued tasks, routing decisions',
    category: 'tools',
    type: 'view',
    keywords: [
      'trace',
      'traceroute',
      'agent',
      'execution',
      'live',
      'monitor',
      'pipeline',
      'debug',
      'orchestration',
      'fleet',
      'status',
      'timing',
    ],
  },
  {
    id: 'command-center',
    label: 'Command Center',
    description:
      'Compute mesh dashboard — physical node health, Tailscale topology, service distribution, failover chain',
    category: 'tools',
    type: 'view',
    keywords: [
      'command center',
      'mesh',
      'nodes',
      'compute',
      'tailscale',
      'hardware',
      'topology',
      'infrastructure',
      'failover',
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'System administration — agent roster, stats, quality, cost overview',
    category: 'tools',
    type: 'view',
    keywords: ['admin', 'administration', 'system', 'settings', 'config'],
  },
  {
    id: 'finetune',
    label: 'Fine-Tuning',
    description: 'Monitor LoRA fine-tuning pipeline — latest run, history, skill coverage',
    category: 'tools',
    type: 'view',
    keywords: ['finetune', 'fine-tuning', 'training', 'lora', 'model'],
  },

  // ── External (MIB007) ──
  {
    id: 'mib-tasks',
    label: 'Tasks (MIB007)',
    description: 'Full task management in MIB007 — Kanban, filters, bulk actions, dependencies',
    category: 'external',
    type: 'external',
    url: mib007Link('tasks'),
    keywords: ['mib tasks', 'kanban', 'full tasks'],
  },
  {
    id: 'mib-projects',
    label: 'Projects (MIB007)',
    description: 'Full project management in MIB007 — project details, issues, goals',
    category: 'external',
    type: 'external',
    url: mib007Link('projects'),
    keywords: ['mib projects', 'project detail'],
  },
  {
    id: 'mib-agents',
    label: 'Agents (MIB007)',
    description: 'Agent management in MIB007 — DNA profiles, runs, task history, configuration',
    category: 'external',
    type: 'external',
    url: mib007Link('agents/all'),
    keywords: ['mib agents', 'agent management', 'agent list'],
  },
  {
    id: 'mib-issues',
    label: 'Issues (MIB007)',
    description: 'Issue tracker in MIB007 — bugs, features, backlog management',
    category: 'external',
    type: 'external',
    url: mib007Link('issues'),
    keywords: ['mib issues', 'bugs', 'issue tracker'],
  },
  {
    id: 'mib-reminders',
    label: 'Reminders (MIB007)',
    description: 'Reminder management in MIB007',
    category: 'external',
    type: 'external',
    url: mib007Link('reminders'),
    keywords: ['mib reminders'],
  },
  {
    id: 'mib-home',
    label: 'MIB007 Home',
    description: 'MIB007 main dashboard — overview of agents, tasks, issues, projects',
    category: 'external',
    type: 'external',
    url: mib007Link('home'),
    keywords: ['mib', 'mib007', 'home', 'dashboard', 'main'],
  },
  {
    id: 'investor',
    label: 'Investor Dashboard',
    description:
      'Real-time investor KPIs — business metrics, platform health, AI agent ROI, market opportunities, roadmap',
    category: 'analytics',
    type: 'view',
    keywords: [
      'investor',
      'investors',
      'kpi',
      'metrics',
      'revenue',
      'arr',
      'mrr',
      'pipeline',
      'roi',
      'fundraising',
      'traction',
      'roadmap',
      'dashboard',
    ],
  },
];

/**
 * Find the best matching sitemap entry for a query string.
 * Used by agents to resolve natural language navigation requests.
 */
export function findView(query: string): SitemapEntry | null {
  const q = query.toLowerCase().trim();
  // Exact match on id
  const exact = SITEMAP.find((e) => e.id === q);
  if (exact) return exact;
  // Exact match on label
  const byLabel = SITEMAP.find((e) => e.label.toLowerCase() === q);
  if (byLabel) return byLabel;
  // Keyword match (best = most keywords matched)
  let best: SitemapEntry | null = null;
  let bestScore = 0;
  for (const entry of SITEMAP) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw) || kw.includes(q)) score++;
    }
    if (entry.label.toLowerCase().includes(q)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore > 0 ? best : null;
}
