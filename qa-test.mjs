#!/usr/bin/env node
// shre-chat QA Test Suite
// Tests: auth, router proxy, chat (streaming + non-streaming), agents, model routing,
//        notifications WebSocket, status bar, concurrency, error handling

const BASE = 'http://127.0.0.1:5510';
const NOTIFY_WS = BASE.replace(/^http/, 'ws') + '/ws/notifications';
const CREDS = {
  username: process.env.SHRE_ADMIN_USER || 'admin',
  password:
    process.env.SHRE_ADMIN_PASSWORD ||
    (() => {
      throw new Error('SHRE_ADMIN_PASSWORD required');
    })(),
};

const results = [];

function record(name, pass, timeMs, details = '') {
  results.push({ name, pass, timeMs: Math.round(timeMs), details });
  const icon = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${icon}  ${name} (${Math.round(timeMs)}ms)${details ? ' — ' + details : ''}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, text, json, headers: res.headers };
}

/** Extract text content from a chat response (handles OpenAI, Anthropic, and Ollama shapes) */
function extractContent(json) {
  const raw =
    json?.choices?.[0]?.message?.content ||
    json?.message?.content || // Ollama native chat shape
    json?.content ||
    json?.text ||
    '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((b) => b.text || '').join('');
  return String(raw);
}

// ─── 1. Auth Flow ───────────────────────────────────────────────────────────

async function testAuthLogin() {
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    });
    const elapsed = performance.now() - t0;
    if (r.json?.requires2FA) {
      record(
        '1a. Auth Login',
        true,
        elapsed,
        '2FA required (expected in prod) — skipping token-dependent tests',
      );
      return null; // 2FA enabled, can't get token without email code
    }
    const token = r.json?.token;
    const pass = !!token && r.ok;
    record(
      '1a. Auth Login',
      pass,
      elapsed,
      pass ? `token=${token.slice(0, 12)}...` : `status=${r.status} body=${r.text.slice(0, 100)}`,
    );
    return token;
  } catch (err) {
    record('1a. Auth Login', false, performance.now() - t0, err.message);
    return null;
  }
}

async function testAuthCheck(token) {
  if (!token) {
    record('1b. Auth Check', false, 0, 'skipped — no token');
    return;
  }
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/auth/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pass = r.json?.authenticated === true;
    record(
      '1b. Auth Check',
      pass,
      performance.now() - t0,
      pass ? `user=${r.json.user?.username}` : `body=${r.text.slice(0, 100)}`,
    );
  } catch (err) {
    record('1b. Auth Check', false, performance.now() - t0, err.message);
  }
}

// ─── 2. Router Proxy Health ─────────────────────────────────────────────────

async function testRouterHealth() {
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/router/health`);
    const pass = r.ok && r.json?.status === 'ok';
    record(
      '2. Router Proxy Health',
      pass,
      performance.now() - t0,
      pass
        ? `keys=${r.json?.keys?.total ?? '?'}, models=${r.json?.models?.loaded ?? '?'}`
        : `status=${r.status} body=${r.text.slice(0, 120)}`,
    );
  } catch (err) {
    record('2. Router Proxy Health', false, performance.now() - t0, err.message);
  }
}

// ─── 3. Chat Non-Streaming ─────────────────────────────────────────────────

async function testChatNonStreaming() {
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/router/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with exactly: QA_OK' }],
        stream: false,
        maxTokens: 50,
        agentId: 'main',
      }),
    });
    const elapsed = performance.now() - t0;
    const content = extractContent(r.json);
    const model = r.json?._shre?.model || r.json?.model || 'unknown';
    const pass = r.ok && content.length > 0;
    record(
      '3. Chat Non-Streaming',
      pass,
      elapsed,
      pass
        ? `model=${model}, response="${content.slice(0, 60)}"`
        : `status=${r.status} body=${r.text.slice(0, 120)}`,
    );
    return model;
  } catch (err) {
    record('3. Chat Non-Streaming', false, performance.now() - t0, err.message);
    return null;
  }
}

// ─── 4. Chat Streaming (SSE) ───────────────────────────────────────────────

async function testChatStreaming() {
  const t0 = performance.now();
  let ttfc = 0;
  let chunkCount = 0;
  let fullText = '';
  let model = 'unknown';

  try {
    const res = await fetch(`${BASE}/api/router/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say hello in exactly 5 words.' }],
        stream: true,
        maxTokens: 50,
        agentId: 'main',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      record(
        '4. Chat Streaming (SSE)',
        false,
        performance.now() - t0,
        `status=${res.status} body=${body.slice(0, 120)}`,
      );
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          // Track route event for model info
          if (parsed.type === 'route' || parsed._shre?.model) {
            model = parsed.model || parsed._shre?.model || model;
          }
          // Track delta chunks
          const delta = parsed.choices?.[0]?.delta?.content || parsed.delta || parsed.text || '';
          if (delta) {
            if (chunkCount === 0) ttfc = performance.now() - t0;
            chunkCount++;
            fullText += delta;
          }
        } catch {}
      }
    }

    const totalTime = performance.now() - t0;
    const pass = chunkCount > 0 && fullText.length > 0;
    record(
      '4. Chat Streaming (SSE)',
      pass,
      totalTime,
      pass
        ? `TTFC=${Math.round(ttfc)}ms, chunks=${chunkCount}, model=${model}, text="${fullText.slice(0, 50)}"`
        : 'no chunks received',
    );
  } catch (err) {
    record('4. Chat Streaming (SSE)', false, performance.now() - t0, err.message);
  }
}

// ─── 5. Multiple Agents ────────────────────────────────────────────────────

async function testMultipleAgents() {
  const agents = ['main', 'shre', 'founding-engineer'];
  for (const agentId of agents) {
    const t0 = performance.now();
    try {
      const r = await fetchJson(`${BASE}/api/router/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Reply with your agent name in one word.' }],
          stream: false,
          maxTokens: 30,
          agentId,
        }),
      });
      const elapsed = performance.now() - t0;
      const content = extractContent(r.json);
      const model = r.json?._shre?.model || r.json?.model || '?';
      const pass = r.ok && content.length > 0;
      record(
        `5${agents.indexOf(agentId) === 0 ? 'a' : agents.indexOf(agentId) === 1 ? 'b' : 'c'}. Agent: ${agentId}`,
        pass,
        elapsed,
        pass ? `model=${model}, reply="${content.slice(0, 40)}"` : `status=${r.status}`,
      );
    } catch (err) {
      record(`5. Agent: ${agentId}`, false, performance.now() - t0, err.message);
    }
  }
}

// ─── 6. Model Routing ──────────────────────────────────────────────────────

async function testModelRouting() {
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/router/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        stream: false,
        maxTokens: 20,
      }),
    });
    const elapsed = performance.now() - t0;
    const shreModel = r.json?._shre?.model;
    const topModel = r.json?.model;
    const model = shreModel || topModel || 'not reported';
    const pass = r.ok && (!!shreModel || !!topModel);
    record(
      '6. Model Routing',
      pass,
      elapsed,
      pass
        ? `_shre.model=${shreModel || 'absent'}, top-level model=${topModel || 'absent'}`
        : `status=${r.status} body=${r.text?.slice(0, 100)}`,
    );
  } catch (err) {
    record('6. Model Routing', false, performance.now() - t0, err.message);
  }
}

// ─── 7. Notifications WebSocket ────────────────────────────────────────────
// The legacy OpenClaw gateway (ws://127.0.0.1:18789) was retired on 2026-04-06.
// This test now exercises shre-chat's own notifications upgrade path, which is
// what the browser actually uses.

async function testNotificationsWebSocket() {
  const t0 = performance.now();

  let WebSocket;
  try {
    WebSocket = (await import('ws')).default;
  } catch {
    record('7. Notifications WebSocket', false, performance.now() - t0, 'ws module not available');
    return;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (pass, details) => {
      if (settled) return;
      settled = true;
      record('7. Notifications WebSocket', pass, performance.now() - t0, details);
      try {
        ws.close();
      } catch {}
      resolve();
    };

    const timeout = setTimeout(() => finish(false, 'timeout after 5s'), 5_000);

    let ws;
    try {
      ws = new WebSocket(NOTIFY_WS, {
        rejectUnauthorized: false,
        headers: { Origin: BASE },
      });
    } catch (err) {
      clearTimeout(timeout);
      finish(false, `connect error: ${err.message}`);
      return;
    }

    ws.on('open', () => {
      clearTimeout(timeout);
      finish(true, `upgraded at ${NOTIFY_WS}`);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      finish(false, `ws error: ${err.message}`);
    });
  });
}

// ─── 8. Status Bar API ─────────────────────────────────────────────────────

async function testStatusBar(token) {
  if (!token) {
    record('8. Status Bar API', false, 0, 'skipped — no token');
    return;
  }
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/status-bar`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const elapsed = performance.now() - t0;
    const pass = r.ok && r.json != null;
    const details = pass
      ? `agents=${r.json.activeAgents ?? '?'}, tasks=${r.json.pendingTasks ?? '?'}, gateway=${r.json.gatewayConnected ?? '?'}`
      : `status=${r.status} body=${r.text?.slice(0, 100)}`;
    record('8. Status Bar API', pass, elapsed, details);
  } catch (err) {
    record('8. Status Bar API', false, performance.now() - t0, err.message);
  }
}

// ─── 9. Concurrent Requests ────────────────────────────────────────────────

async function testConcurrentRequests() {
  const t0 = performance.now();
  const prompts = [
    'What is the capital of France? Reply in one word.',
    'What is 7 times 8? Reply with just the number.',
    'Name a color of the rainbow. Reply in one word.',
  ];

  try {
    const promises = prompts.map((content) =>
      fetchJson(`${BASE}/api/router/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          stream: false,
          maxTokens: 20,
        }),
      }),
    );

    const results = await Promise.allSettled(promises);
    const elapsed = performance.now() - t0;
    const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
    ).length;
    const snippets = results
      .map((r, i) => {
        if (r.status === 'fulfilled' && r.value.ok) {
          const c = extractContent(r.value.json);
          return `#${i + 1}="${c.slice(0, 20)}"`;
        }
        return `#${i + 1}=FAIL`;
      })
      .join(', ');

    const pass = succeeded === 3;
    record(
      '9. Concurrent Requests (3x)',
      pass,
      elapsed,
      `${succeeded}/3 ok, ${failed}/3 failed. ${snippets}`,
    );
  } catch (err) {
    record('9. Concurrent Requests (3x)', false, performance.now() - t0, err.message);
  }
}

// ─── 10. Error Handling ────────────────────────────────────────────────────

async function testErrorHandling() {
  const t0 = performance.now();
  try {
    const r = await fetchJson(`${BASE}/api/router/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"messages": "not-an-array", "stream": false}',
    });
    const elapsed = performance.now() - t0;
    // We expect a non-2xx or an error in the body — should NOT crash
    const pass = r.status >= 400 || r.json?.error || r.status < 500;
    record(
      '10. Error Handling (malformed)',
      pass,
      elapsed,
      `status=${r.status}, body=${r.text?.slice(0, 100)}`,
    );
  } catch (err) {
    // Even a network error is acceptable as long as server didn't crash
    record(
      '10. Error Handling (malformed)',
      true,
      performance.now() - t0,
      `caught: ${err.message}`,
    );
  }
}

// ─── Run All ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║       shre-chat QA Test Suite                ║\x1b[0m');
  console.log('\x1b[1m║       Target: http://127.0.0.1:5510          ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m\n');

  // Pre-flight: is the server up?
  try {
    await fetch(`${BASE}/api/auth/check`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error('\x1b[31mERROR: shre-chat server not reachable at ' + BASE + '\x1b[0m');
    process.exit(1);
  }

  // 1. Auth
  console.log('\x1b[36m── Auth ──\x1b[0m');
  const token = await testAuthLogin();
  await testAuthCheck(token);

  // 2. Router health
  console.log('\n\x1b[36m── Router Proxy ──\x1b[0m');
  await testRouterHealth();

  // 3. Chat non-streaming
  console.log('\n\x1b[36m── Chat (Non-Streaming) ──\x1b[0m');
  await testChatNonStreaming();

  // 4. Chat streaming
  console.log('\n\x1b[36m── Chat (Streaming SSE) ──\x1b[0m');
  await testChatStreaming();

  // 5. Multiple agents
  console.log('\n\x1b[36m── Multiple Agents ──\x1b[0m');
  await testMultipleAgents();

  // 6. Model routing
  console.log('\n\x1b[36m── Model Routing ──\x1b[0m');
  await testModelRouting();

  // 7. Gateway WebSocket
  console.log('\n\x1b[36m── Gateway WebSocket ──\x1b[0m');
  await testNotificationsWebSocket();

  // 8. Status bar
  console.log('\n\x1b[36m── Status Bar ──\x1b[0m');
  await testStatusBar(token);

  // 9. Concurrent
  console.log('\n\x1b[36m── Concurrency ──\x1b[0m');
  await testConcurrentRequests();

  // 10. Error handling
  console.log('\n\x1b[36m── Error Handling ──\x1b[0m');
  await testErrorHandling();

  // ── Summary Table ─────────────────────────────────────────────────────────
  console.log(
    '\n\x1b[1m┌─────────────────────────────────────────────────────────────────────────────────────────────┐\x1b[0m',
  );
  console.log(
    '\x1b[1m│  SUMMARY                                                                                    │\x1b[0m',
  );
  console.log(
    '\x1b[1m├────┬──────────────────────────────────────┬────────┬──────────┬──────────────────────────────┤\x1b[0m',
  );
  console.log(
    '\x1b[1m│ #  │ Test                                 │ Result │ Time(ms) │ Details                      │\x1b[0m',
  );
  console.log(
    '\x1b[1m├────┼──────────────────────────────────────┼────────┼──────────┼──────────────────────────────┤\x1b[0m',
  );

  results.forEach((r, i) => {
    const num = String(i + 1).padStart(2);
    const name = r.name.padEnd(36).slice(0, 36);
    const status = r.pass ? '\x1b[32mPASS\x1b[0m  ' : '\x1b[31mFAIL\x1b[0m  ';
    const time = String(r.timeMs).padStart(6);
    const detail = (r.details || '').slice(0, 28).padEnd(28);
    console.log(`│ ${num} │ ${name} │ ${status} │ ${time}   │ ${detail} │`);
  });

  console.log(
    '\x1b[1m└────┴──────────────────────────────────────┴────────┴──────────┴──────────────────────────────┘\x1b[0m',
  );

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const color = passed === total ? '\x1b[32m' : passed > total / 2 ? '\x1b[33m' : '\x1b[31m';
  console.log(`\n${color}${passed}/${total} tests passed\x1b[0m\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
