// ---------------------------------------------------------------------------
// Process Bar — canonical types (shared with MIB007)
// ---------------------------------------------------------------------------

export type ProcessStepKind =
  | 'thinking'
  | 'planning'
  | 'tool_use'
  | 'tool_result'
  | 'generating'
  | 'compacting'
  | 'done'
  | 'attention'
  | 'approval'
  | 'error';

export type ProcessStepStatus = 'active' | 'completed' | 'error';

export interface ProcessStep {
  id: string;
  kind: ProcessStepKind;
  label: string;
  detail?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolOutput?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  status: ProcessStepStatus;
}

export interface ProcessRun {
  id: string;
  sessionId: string;
  steps: ProcessStep[];
  startedAt: number;
  completedAt?: number;
  model?: string;
  tokenUsage?: { input: number; output: number };
  durationMs?: number;
}
