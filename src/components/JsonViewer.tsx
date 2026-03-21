import React, { useState } from 'react';

const colors = {
  key: '#60a5fa', string: '#4ade80', number: '#f59e0b',
  boolean: '#a78bfa', null: 'rgba(255,255,255,0.3)', brace: 'rgba(255,255,255,0.4)',
  index: 'rgba(255,255,255,0.35)',
};

function CopyBtn({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(value, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      style={{ marginLeft: 6, opacity: copied ? 1 : 0, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, transition: 'opacity 0.15s' }}
      className="json-copy-btn"
    >{copied ? 'copied' : 'copy'}</button>
  );
}

function JsonNode({ data, depth, maxDepth, keyName, isIndex }: {
  data: unknown; depth: number; maxDepth: number; keyName?: string | number; isIndex?: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [strExpanded, setStrExpanded] = useState(false);

  const isObj = data !== null && typeof data === 'object';
  const isArr = Array.isArray(data);
  const entries = isObj ? (isArr ? (data as unknown[]).map((v, i) => [i, v] as const) : Object.entries(data as Record<string, unknown>)) : [];
  const count = entries.length;

  const renderKey = () => {
    if (keyName === undefined) return null;
    const style = isIndex
      ? { color: colors.index, fontStyle: 'italic' as const }
      : { color: colors.key };
    return <span style={style}>{isIndex ? keyName : `"${keyName}"`}<span style={{ color: colors.brace }}>: </span></span>;
  };

  if (data === null) return (
    <div style={{ paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }} className="json-row">
      {renderKey()}<span style={{ color: colors.null }}>null</span><CopyBtn value={null} />
    </div>
  );

  if (typeof data === 'boolean') return (
    <div style={{ paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }} className="json-row">
      {renderKey()}<span style={{ color: colors.boolean }}>{String(data)}</span><CopyBtn value={data} />
    </div>
  );

  if (typeof data === 'number') return (
    <div style={{ paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }} className="json-row">
      {renderKey()}<span style={{ color: colors.number }}>{data}</span><CopyBtn value={data} />
    </div>
  );

  if (typeof data === 'string') {
    const long = data.length > 100 && !strExpanded;
    const display = long ? data.slice(0, 100) + '...' : data;
    return (
      <div style={{ paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }} className="json-row">
        {renderKey()}
        <span style={{ color: colors.string, cursor: long || data.length > 100 ? 'pointer' : 'default' }}
          onClick={() => data.length > 100 && setStrExpanded(!strExpanded)}>
          "{display}"
        </span>
        <CopyBtn value={data} />
      </div>
    );
  }

  if (!isObj) return (
    <div style={{ paddingLeft: depth * 16 }} className="json-row">
      {renderKey()}<span>{String(data)}</span>
    </div>
  );

  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';
  const summary = isArr ? `[...] ${count} items` : `{...} ${count} keys`;

  if (!expanded) return (
    <div style={{ paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }} className="json-row">
      <span style={{ cursor: 'pointer', marginRight: 4, userSelect: 'none' }} onClick={() => setExpanded(true)}>&#9656;</span>
      {renderKey()}
      <span style={{ color: colors.brace, cursor: 'pointer' }} onClick={() => setExpanded(true)}>{summary}</span>
      <CopyBtn value={data} />
    </div>
  );

  return (
    <div>
      <div style={{ paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }} className="json-row">
        <span style={{ cursor: 'pointer', marginRight: 4, userSelect: 'none' }} onClick={() => depth > 0 && setExpanded(false)}>&#9662;</span>
        {renderKey()}
        <span style={{ color: colors.brace }}>{open}</span>
        <CopyBtn value={data} />
      </div>
      {entries.map(([k, v]) => (
        <JsonNode key={String(k)} data={v} depth={depth + 1} maxDepth={maxDepth} keyName={k} isIndex={isArr} />
      ))}
      <div style={{ paddingLeft: depth * 16 }}>
        <span style={{ color: colors.brace }}>{close}</span>
      </div>
    </div>
  );
}

export default function JsonViewer({ data, maxDepth = 3 }: { data: unknown; maxDepth?: number }) {
  return (
    <div style={{
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
      fontSize: 13, lineHeight: '20px', maxHeight: 400, overflowY: 'auto',
      padding: '8px 0', color: '#e5e5e5',
    }}>
      <style>{`.json-row:hover .json-copy-btn { opacity: 1 !important; }`}</style>
      <JsonNode data={data} depth={0} maxDepth={maxDepth} />
    </div>
  );
}
