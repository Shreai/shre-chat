import { usePreferences, ALLOW_DIRECT_MODE, type GatewayMode } from '../preferences-store';

/** Routing mode indicator — shows which gateway path chat messages take. */
export function RoutingModeIndicator() {
  const gatewayMode = usePreferences((s) => s.gatewayMode);
  const setGatewayMode = usePreferences((s) => s.setGatewayMode);

  const config: Record<GatewayMode, { label: string; color: string; title: string }> = {
    router: { label: 'Router', color: '#3b82f6', title: 'Shre Router — trust gate, RAG, scoring' },
    direct: {
      label: 'Direct',
      color: '#22c55e',
      title: 'Direct local mode — explicitly enabled only',
    },
  };
  const modes: GatewayMode[] = ALLOW_DIRECT_MODE ? ['router', 'direct'] : ['router'];
  const c = config[gatewayMode];

  return (
    <button
      className="status-bar-item hidden sm:flex items-center"
      style={{
        gap: 4,
        padding: '1px 6px',
        borderRadius: 4,
        background: `${c.color}15`,
        border: `1px solid ${c.color}25`,
        cursor: 'pointer',
      }}
      title={`${c.title} — click to cycle`}
      onClick={() => {
        const idx = modes.indexOf(gatewayMode);
        setGatewayMode(modes[(idx + 1) % modes.length]);
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: c.color,
          boxShadow: `0 0 4px ${c.color}`,
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: c.color, letterSpacing: '0.02em' }}>
        {c.label}
      </span>
    </button>
  );
}

/** Compact gateway pill for the bottom status bar — click to cycle modes. */
export function StatusBarGatewayPill() {
  const gatewayMode = usePreferences((s) => s.gatewayMode);
  const setGatewayMode = usePreferences((s) => s.setGatewayMode);
  const modes: GatewayMode[] = ALLOW_DIRECT_MODE ? ['router', 'direct'] : ['router'];
  const cfg: Record<GatewayMode, { label: string; color: string }> = {
    router: { label: 'R', color: '#3b82f6' },
    direct: { label: 'D', color: '#22c55e' },
  };
  const c = cfg[gatewayMode];
  return (
    <button
      onClick={() => {
        const idx = modes.indexOf(gatewayMode);
        setGatewayMode(modes[(idx + 1) % modes.length]);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '4px 8px',
        minHeight: 32,
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: `${c.color}15`,
        color: c.color,
        border: `1px solid ${c.color}30`,
        cursor: 'pointer',
      }}
      title={`Gateway: ${gatewayMode} — click to cycle`}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
      {c.label}
    </button>
  );
}
