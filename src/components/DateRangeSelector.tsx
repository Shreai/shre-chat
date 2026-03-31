import React, { useState } from 'react';

interface DateRange {
  from: string;
  to: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DateRangeSelector({ value, onChange }: Props) {
  const [custom, setCustom] = useState(false);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESETS.map((p) => {
        const from = p.days === 0 ? today() : daysAgo(p.days);
        const to = today();
        const active = value.from === from && value.to === to;
        return (
          <button
            key={p.label}
            onClick={() => {
              setCustom(false);
              onChange({ from, to });
            }}
            className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
            style={{
              background: active ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
              color: active ? '#fff' : 'var(--c-text-3)',
              border: `1px solid ${active ? 'transparent' : 'var(--c-border-2)'}`,
            }}
          >
            {p.label}
          </button>
        );
      })}
      <button
        onClick={() => setCustom(!custom)}
        className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
        style={{
          background: custom ? 'var(--c-accent, #6366f1)' : 'var(--c-bg-2)',
          color: custom ? '#fff' : 'var(--c-text-3)',
          border: `1px solid ${custom ? 'transparent' : 'var(--c-border-2)'}`,
        }}
      >
        Custom
      </button>
      {custom && (
        <div className="flex items-center gap-1 ml-1">
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--c-bg-2)',
              color: 'var(--c-text-2)',
              border: '1px solid var(--c-border-2)',
            }}
          />
          <span className="text-[10px]" style={{ color: 'var(--c-text-5)' }}>
            →
          </span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--c-bg-2)',
              color: 'var(--c-text-2)',
              border: '1px solid var(--c-border-2)',
            }}
          />
        </div>
      )}
    </div>
  );
}
