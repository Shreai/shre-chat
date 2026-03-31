import { useReducer, useCallback, useMemo } from 'react';
import type { ProcessRun, ProcessStep, ProcessStepKind } from './types';

type Action =
  | { type: 'START_RUN'; runId: string; sessionId: string }
  | { type: 'ADD_STEP'; runId: string; step: ProcessStep }
  | { type: 'UPDATE_STEP'; runId: string; stepId: string; patch: Partial<ProcessStep> }
  | {
      type: 'COMPLETE_RUN';
      runId: string;
      meta?: {
        model?: string;
        tokenUsage?: { input: number; output: number };
        durationMs?: number;
      };
    }
  | { type: 'CLEAR' };

interface State {
  runs: ProcessRun[];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START_RUN':
      return {
        runs: [
          ...state.runs,
          { id: action.runId, sessionId: action.sessionId, steps: [], startedAt: Date.now() },
        ],
      };
    case 'ADD_STEP':
      return {
        runs: state.runs.map((r) =>
          r.id === action.runId ? { ...r, steps: [...r.steps, action.step] } : r,
        ),
      };
    case 'UPDATE_STEP':
      return {
        runs: state.runs.map((r) =>
          r.id === action.runId
            ? {
                ...r,
                steps: r.steps.map((s) =>
                  s.id === action.stepId ? { ...s, ...action.patch, updatedAt: Date.now() } : s,
                ),
              }
            : r,
        ),
      };
    case 'COMPLETE_RUN':
      return {
        runs: state.runs.map((r) =>
          r.id === action.runId
            ? {
                ...r,
                completedAt: Date.now(),
                ...(action.meta?.model ? { model: action.meta.model } : {}),
                ...(action.meta?.tokenUsage ? { tokenUsage: action.meta.tokenUsage } : {}),
                ...(action.meta?.durationMs ? { durationMs: action.meta.durationMs } : {}),
                steps: r.steps.map((s) =>
                  s.status === 'active'
                    ? { ...s, status: 'completed' as const, completedAt: Date.now() }
                    : s,
                ),
              }
            : r,
        ),
      };
    case 'CLEAR':
      return { runs: [] };
    default:
      return state;
  }
}

let stepCounter = 0;

export function useProcessRun() {
  const [state, dispatch] = useReducer(reducer, { runs: [] });

  const startRun = useCallback((runId: string, sessionId: string) => {
    dispatch({ type: 'START_RUN', runId, sessionId });
  }, []);

  const addStep = useCallback(
    (
      runId: string,
      opts: {
        kind: ProcessStepKind;
        label: string;
        toolName?: string;
        toolArgs?: unknown;
        detail?: string;
      },
    ) => {
      const id = `step-${++stepCounter}`;
      const now = Date.now();
      const step: ProcessStep = {
        id,
        kind: opts.kind,
        label: opts.label,
        toolName: opts.toolName,
        toolArgs: opts.toolArgs,
        detail: opts.detail,
        startedAt: now,
        updatedAt: now,
        status: 'active',
      };
      dispatch({ type: 'ADD_STEP', runId, step });
      return id;
    },
    [],
  );

  const updateStep = useCallback((runId: string, stepId: string, patch: Partial<ProcessStep>) => {
    dispatch({ type: 'UPDATE_STEP', runId, stepId, patch });
  }, []);

  const completeRun = useCallback(
    (
      runId: string,
      meta?: {
        model?: string;
        tokenUsage?: { input: number; output: number };
        durationMs?: number;
      },
    ) => {
      dispatch({ type: 'COMPLETE_RUN', runId, meta });
    },
    [],
  );

  const clearRuns = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  const activeRun = useMemo(() => state.runs.find((r) => !r.completedAt) ?? null, [state.runs]);

  return { runs: state.runs, activeRun, startRun, addStep, updateStep, completeRun, clearRuns };
}
