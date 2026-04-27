#!/usr/bin/env node
/**
 * CLI Session Ledger — End-to-End Test Suite
 *
 * Tests the complete flow:
 *   1. Session creation on CLI activation
 *   2. Message recording (user + assistant)
 *   3. Ledger file generation (markdown + JSONL)
 *   4. Session listing, retrieval, and filtering
 *   5. Summary generation and toggle
 *   6. Session close/completion
 *   7. Context injection (memory across messages)
 *   8. Tool event recording
 *   9. Multi-session management
 *  10. Edge cases (empty messages, concurrent sessions, large responses)
 *
 * Usage:
 *   node test-cli-ledger.mjs              # Run all tests
 *   node test-cli-ledger.mjs --unit       # Unit tests only (no server needed)
 *   node test-cli-ledger.mjs --api        # API tests (requires shre-chat running)
 *   node test-cli-ledger.mjs --e2e        # Full E2E (requires shre-chat + claude CLI)
 */

import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Test harness ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}`);
  }
}

function skip(label) {
  skipped++;
  console.log(`  \x1b[33mSKIP\x1b[0m ${label}`);
}

const mode = process.argv[2] || "--all";
const runUnit = mode === "--all" || mode === "--unit";
const runApi = mode === "--all" || mode === "--api";
const runE2E = mode === "--e2e";

// ── Dynamic import of ledger module ──────────────────────────────────────
const LEDGER_MODULE = join(import.meta.dirname || ".", "routes", "cli-ledger.js");
let ledger;
try {
  ledger = await import(LEDGER_MODULE);
} catch (err) {
  console.error(`Failed to import cli-ledger module: ${err.message}`);
  process.exit(1);
}

const {
  createSession,
  appendUserMessage,
  appendCliResponse,
  appendToolEvent,
  getSession,
  getLedger,
  getEvents,
  getMessages,
  closeSession,
  listSessions,
  getOrCreateActiveSession,
  buildSessionContext,
  setSummary,
} = ledger;

const LEDGER_ROOT = join(homedir(), ".shre", "sessions", "cli");
const TEST_AGENT = `test-agent-${Date.now()}`;

// ── Unit Tests ──────────────────────────────────────────────────────────

if (runUnit) {
  console.log("\n\x1b[1m=== UNIT TESTS: CLI Session Ledger ===\x1b[0m\n");

  // ── Test 1: Session creation ──
  console.log("1. Session Creation");
  const sess = createSession({ agentId: TEST_AGENT, type: "chat", title: "Test Session" });
  assert(sess.sessionId.startsWith("cli-"), "Session ID has cli- prefix");
  assert(existsSync(sess.sessionDir), "Session directory created");
  assert(existsSync(sess.metaPath), "session.json exists");
  assert(existsSync(sess.ledgerPath), "ledger.md exists");
  assert(existsSync(sess.eventsPath), "events.jsonl exists");

  const meta = JSON.parse(readFileSync(sess.metaPath, "utf8"));
  assert(meta.id === sess.sessionId, "Meta ID matches session ID");
  assert(meta.agentId === TEST_AGENT, "Meta agentId correct");
  assert(meta.type === "chat", "Meta type is chat");
  assert(meta.status === "active", "Meta status is active");
  assert(meta.title === "Test Session", "Meta title correct");

  const ledgerContent = readFileSync(sess.ledgerPath, "utf8");
  assert(ledgerContent.includes("# CLI Session: Test Session"), "Ledger has header");
  assert(ledgerContent.includes(sess.sessionId), "Ledger contains session ID");

  // ── Test 2: User message appending ──
  console.log("\n2. User Message Recording");
  const msgId = appendUserMessage(sess.sessionId, "Fix the login bug in auth.ts");
  assert(typeof msgId === "string", "Returns message ID");
  assert(msgId.startsWith("msg-"), "Message ID has msg- prefix");

  const ledgerAfterMsg = readFileSync(sess.ledgerPath, "utf8");
  assert(ledgerAfterMsg.includes("## ["), "Ledger has timestamped header");
  assert(ledgerAfterMsg.includes("] User"), "Ledger marks user role");
  assert(ledgerAfterMsg.includes("Fix the login bug"), "Ledger contains message content");

  const events = getEvents(sess.sessionId);
  const userEvt = events.find((e) => e.type === "user_message");
  assert(userEvt !== undefined, "User message event in JSONL");
  assert(userEvt.content === "Fix the login bug in auth.ts", "Event content matches");

  // Voice source
  const voiceMsgId = appendUserMessage(sess.sessionId, "check deployment status", { source: "voice" });
  const ledgerVoice = readFileSync(sess.ledgerPath, "utf8");
  assert(ledgerVoice.includes("(voice)"), "Voice messages marked in ledger");

  // ── Test 3: CLI response recording ──
  console.log("\n3. CLI Response Recording");
  const response = "I fixed the login bug. The issue was in the token validation logic at line 42.";
  appendCliResponse(sess.sessionId, msgId, response, {
    model: "claude-sonnet-4-6",
    cost: 0.0023,
    duration: 3500,
    tools: [{ name: "Read" }, { name: "Edit" }],
  });

  const ledgerAfterRes = readFileSync(sess.ledgerPath, "utf8");
  assert(ledgerAfterRes.includes("## ["), "Response has timestamp header");
  assert(ledgerAfterRes.includes("] Assistant"), "Response marked as Assistant");
  assert(ledgerAfterRes.includes("claude-sonnet-4-6"), "Model shown in ledger");
  assert(ledgerAfterRes.includes("I fixed the login bug"), "Response content in ledger");
  assert(ledgerAfterRes.includes("`Read`"), "Tool names in ledger");
  assert(ledgerAfterRes.includes("$0.0023"), "Cost in ledger");

  const metaAfter = getSession(sess.sessionId);
  assert(metaAfter.messageCount >= 3, "Message count incremented");
  assert(metaAfter.totalCost > 0, "Cost accumulated");

  // ── Test 4: Tool event recording ──
  console.log("\n4. Tool Event Recording");
  appendToolEvent(sess.sessionId, "Bash", "npm test", "All tests passed (12/12)");
  appendToolEvent(sess.sessionId, "Edit", "auth.ts:42", "Token validation fixed", { isError: false });
  appendToolEvent(sess.sessionId, "Read", "auth.ts", "file contents...");

  const allEvents = getEvents(sess.sessionId);
  const toolEvts = allEvents.filter((e) => e.type === "tool_execution");
  assert(toolEvts.length === 3, "3 tool events recorded");
  assert(toolEvts[0].tool === "Bash", "First tool is Bash");
  assert(toolEvts[0].output.includes("All tests passed"), "Tool output recorded");

  // ── Test 5: Message retrieval with view modes ──
  console.log("\n5. Message Retrieval & View Modes");
  const fullMsgs = getMessages(sess.sessionId, { viewMode: "full" });
  assert(fullMsgs.length >= 2, "Has user + assistant messages");
  assert(fullMsgs[0].viewMode === "full", "Default view is full");

  // Add summary to the response
  const resEvent = allEvents.find((e) => e.type === "cli_response");
  if (resEvent) {
    const updated = setSummary(sess.sessionId, resEvent.id, "Fixed token validation bug in auth.ts line 42.");
    assert(updated, "Summary set successfully");

    const summaryMsgs = getMessages(sess.sessionId, { viewMode: "summary" });
    const summaryRes = summaryMsgs.find((m) => m.type === "cli_response" && m.hasSummary);
    assert(summaryRes !== undefined, "Summary view returns summarized content");
    assert(summaryRes?.displayContent === "Fixed token validation bug in auth.ts line 42.", "Summary content correct");
    assert(summaryRes?.viewMode === "summary", "View mode is summary");
  }

  // ── Test 6: Session listing & filtering ──
  console.log("\n6. Session Listing & Filtering");
  // Create additional sessions
  const sess2 = createSession({ agentId: TEST_AGENT, type: "project", title: "Project Alpha" });
  const sess3 = createSession({ agentId: TEST_AGENT, type: "task", title: "Bug Fix #123" });
  const sess4 = createSession({ agentId: "other-agent", type: "chat", title: "Other Agent Chat" });

  const allSessions = listSessions({ agentId: TEST_AGENT });
  assert(allSessions.length >= 3, "Lists all sessions for agent");

  const projectSessions = listSessions({ type: "project", agentId: TEST_AGENT });
  assert(projectSessions.length >= 1, "Filters by type=project");
  assert(projectSessions[0].type === "project", "Filtered session is project type");

  const activeSessions = listSessions({ status: "active", agentId: TEST_AGENT });
  assert(activeSessions.length >= 3, "All sessions are active");

  // ── Test 7: Session close ──
  console.log("\n7. Session Close");
  const closed = closeSession(sess3.sessionId);
  assert(closed.status === "completed", "Session marked completed");
  assert(closed.closedAt !== undefined, "closedAt timestamp set");

  const closedSess = getSession(sess3.sessionId);
  assert(closedSess.status === "completed", "Persisted as completed");

  const abandoned = closeSession(sess4.sessionId, { reason: "abandoned" });
  assert(abandoned.status === "abandoned", "Session can be abandoned");

  // ── Test 8: Get or create active session ──
  console.log("\n8. Active Session Management");
  const existing = getOrCreateActiveSession(TEST_AGENT, { type: "chat" });
  assert(existing.resumed === true, "Resumes existing active session");
  assert(existing.sessionId === sess.sessionId, "Resumes the first active session");

  // For a type with no active sessions, creates new
  const newTask = getOrCreateActiveSession(TEST_AGENT, { type: "task", title: "New Task" });
  // sess3 was closed, so this should create a new one
  assert(newTask.sessionId !== sess3.sessionId, "Creates new session when none active");

  // ── Test 9: Context injection ──
  console.log("\n9. Context Injection for CLI Memory");
  const context = buildSessionContext(sess.sessionId, 10);
  assert(context.includes("<session_context"), "Context has XML wrapper");
  assert(context.includes(sess.sessionId), "Context includes session ID");
  assert(context.includes("[User]:"), "Context includes user messages");
  assert(context.includes("[Assistant]:"), "Context includes assistant messages");
  assert(context.includes("Fix the login bug"), "Context includes message content");

  // ── Test 10: Ledger markdown format ──
  console.log("\n10. Ledger Markdown Integrity");
  const finalLedger = getLedger(sess.sessionId);
  assert(finalLedger !== null, "Ledger retrievable");
  assert(finalLedger.startsWith("# CLI Session:"), "Starts with header");
  assert(finalLedger.includes("---"), "Has section dividers");
  assert((finalLedger.match(/## \[/g) || []).length >= 3, "Has 3+ timestamped sections");

  // ── Test 11: Session types ──
  console.log("\n11. Session Types");
  const chatSess = createSession({ agentId: TEST_AGENT, type: "chat" });
  assert(getSession(chatSess.sessionId).type === "chat", "Chat type persists");

  const projSess = createSession({ agentId: TEST_AGENT, type: "project" });
  assert(getSession(projSess.sessionId).type === "project", "Project type persists");

  const taskSess = createSession({ agentId: TEST_AGENT, type: "task", taskId: "TASK-456" });
  const taskMeta = getSession(taskSess.sessionId);
  assert(taskMeta.type === "task", "Task type persists");
  assert(taskMeta.taskId === "TASK-456", "Task ID linked");

  // Invalid type falls back to chat
  const invalidSess = createSession({ agentId: TEST_AGENT, type: "invalid" });
  assert(getSession(invalidSess.sessionId).type === "chat", "Invalid type falls back to chat");

  // ── Test 12: Error handling ──
  console.log("\n12. Error Handling");
  try {
    appendUserMessage("nonexistent-session-id", "test");
    assert(false, "Should throw for nonexistent session");
  } catch (err) {
    assert(err.message.includes("Session not found"), "Throws for nonexistent session");
  }

  const nullSession = getSession("nonexistent-session-id");
  assert(nullSession === null, "Returns null for nonexistent session");

  const nullLedger = getLedger("nonexistent-session-id");
  assert(nullLedger === null, "Returns null ledger for nonexistent session");

  const emptyEvents = getEvents("nonexistent-session-id");
  assert(emptyEvents.length === 0, "Returns empty events for nonexistent session");

  // ── Test 13: Large response handling ──
  console.log("\n13. Large Response Handling");
  const largeSess = createSession({ agentId: TEST_AGENT, type: "chat", title: "Large Response Test" });
  const largeMsg = appendUserMessage(largeSess.sessionId, "Generate a report");
  const largeResponse = "x".repeat(50_000);
  appendCliResponse(largeSess.sessionId, largeMsg, largeResponse, { model: "claude-opus-4-6" });
  const largeEvents = getEvents(largeSess.sessionId);
  const largeRes = largeEvents.find((e) => e.type === "cli_response");
  assert(largeRes.content.length === 50_000, "Full large response stored");

  // ── Cleanup ──
  console.log("\n  Cleaning up test sessions...");
  try {
    // Clean up all test sessions
    const testSessions = listSessions({ agentId: TEST_AGENT });
    for (const s of testSessions) {
      const dir = join(LEDGER_ROOT, s.id);
      if (existsSync(dir)) rmSync(dir, { recursive: true });
    }
    // Also clean up other-agent sessions
    const otherSessions = listSessions({ agentId: "other-agent" });
    for (const s of otherSessions) {
      const dir = join(LEDGER_ROOT, s.id);
      if (existsSync(dir)) rmSync(dir, { recursive: true });
    }
  } catch { /* best effort */ }
}

// ── API Tests ───────────────────────────────────────────────────────────

if (runApi) {
  console.log("\n\x1b[1m=== API TESTS: CLI Ledger Endpoints ===\x1b[0m\n");

  const CHAT_PORT = process.env.SHRE_CHAT_PORT || 5510;
  const BASE = `https://127.0.0.1:${CHAT_PORT}`;

  // Check if shre-chat is running
  let serverUp = false;
  try {
    const r = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    serverUp = r.ok;
  } catch {
    serverUp = false;
  }

  if (!serverUp) {
    console.log("  shre-chat not running at", BASE);
    skip("API tests require shre-chat to be running");
  } else {
    // ── API Test 1: List sessions ──
    console.log("1. GET /api/cli/sessions");
    try {
      const r = await fetch(`${BASE}/api/cli/sessions`, { signal: AbortSignal.timeout(5000) });
      assert(r.ok, "Sessions endpoint returns 200");
      const sessions = await r.json();
      assert(Array.isArray(sessions), "Returns array of sessions");
    } catch (err) {
      assert(false, `Sessions endpoint: ${err.message}`);
    }

    // ── API Test 2: Create session via CLI chat ──
    console.log("\n2. POST /api/cli/chat (creates ledger session)");
    let ledgerSessionId = null;
    try {
      const r = await fetch(`${BASE}/api/cli/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "echo 'ledger test'",
          agentId: "test-api",
          sessionType: "chat",
          sessionTitle: "API Test Session",
        }),
        signal: AbortSignal.timeout(30000),
      });
      assert(r.ok, "CLI chat endpoint returns 200");

      // Parse SSE to find ledger session ID
      const text = await r.text();
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.ledgerSessionId) {
            ledgerSessionId = evt.ledgerSessionId;
          }
        } catch { /* skip */ }
      }
      assert(ledgerSessionId !== null, "SSE stream includes ledger session ID");
    } catch (err) {
      assert(false, `CLI chat: ${err.message}`);
    }

    // ── API Test 3: Get session detail ──
    if (ledgerSessionId) {
      console.log("\n3. GET /api/cli/sessions/:id");
      try {
        const r = await fetch(`${BASE}/api/cli/sessions/${ledgerSessionId}`, {
          signal: AbortSignal.timeout(5000),
        });
        assert(r.ok, "Session detail returns 200");
        const session = await r.json();
        assert(session.id === ledgerSessionId, "Session ID matches");
        assert(session.status === "active", "Session is active");
      } catch (err) {
        assert(false, `Session detail: ${err.message}`);
      }

      // ── API Test 4: Get ledger markdown ──
      console.log("\n4. GET /api/cli/sessions/:id/ledger");
      try {
        const r = await fetch(`${BASE}/api/cli/sessions/${ledgerSessionId}/ledger`, {
          signal: AbortSignal.timeout(5000),
        });
        assert(r.ok, "Ledger endpoint returns 200");
        const md = await r.text();
        assert(md.includes("# CLI Session:"), "Returns markdown with header");
      } catch (err) {
        assert(false, `Ledger: ${err.message}`);
      }

      // ── API Test 5: Get messages ──
      console.log("\n5. GET /api/cli/sessions/:id/messages");
      try {
        const r = await fetch(`${BASE}/api/cli/sessions/${ledgerSessionId}/messages`, {
          signal: AbortSignal.timeout(5000),
        });
        assert(r.ok, "Messages endpoint returns 200");
        const msgs = await r.json();
        assert(Array.isArray(msgs), "Returns array of messages");
        assert(msgs.length >= 1, "Has at least 1 message");
      } catch (err) {
        assert(false, `Messages: ${err.message}`);
      }

      // ── API Test 6: Summary view mode ──
      console.log("\n6. GET /api/cli/sessions/:id/messages?view=summary");
      try {
        const r = await fetch(`${BASE}/api/cli/sessions/${ledgerSessionId}/messages?view=summary`, {
          signal: AbortSignal.timeout(5000),
        });
        assert(r.ok, "Summary view returns 200");
        const msgs = await r.json();
        assert(msgs.every((m) => m.viewMode), "All messages have viewMode");
      } catch (err) {
        assert(false, `Summary view: ${err.message}`);
      }

      // ── API Test 7: Close session ──
      console.log("\n7. POST /api/cli/sessions/:id/close");
      try {
        const r = await fetch(`${BASE}/api/cli/sessions/${ledgerSessionId}/close`, {
          method: "POST",
          signal: AbortSignal.timeout(5000),
        });
        assert(r.ok, "Close endpoint returns 200");
        const closed = await r.json();
        assert(closed.status === "completed", "Session marked completed");
      } catch (err) {
        assert(false, `Close session: ${err.message}`);
      }

      // ── API Test 8: Filter by status ──
      console.log("\n8. GET /api/cli/sessions?status=completed");
      try {
        const r = await fetch(`${BASE}/api/cli/sessions?status=completed`, {
          signal: AbortSignal.timeout(5000),
        });
        assert(r.ok, "Filter returns 200");
        const sessions = await r.json();
        assert(sessions.every((s) => s.status === "completed"), "All returned sessions are completed");
      } catch (err) {
        assert(false, `Filter: ${err.message}`);
      }

      // Cleanup: remove test session
      try {
        const dir = join(LEDGER_ROOT, ledgerSessionId);
        if (existsSync(dir)) rmSync(dir, { recursive: true });
      } catch { /* best effort */ }
    }
  }
}

// ── E2E Tests ───────────────────────────────────────────────────────────

if (runE2E) {
  console.log("\n\x1b[1m=== E2E TESTS: Full CLI Ledger Flow ===\x1b[0m\n");

  const CHAT_PORT = process.env.SHRE_CHAT_PORT || 5510;
  const BASE = `https://127.0.0.1:${CHAT_PORT}`;

  let serverUp = false;
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    serverUp = r.ok;
  } catch { serverUp = false; }

  if (!serverUp) {
    skip("E2E tests require shre-chat running");
  } else {
    console.log("1. Full Flow: Send message -> Ledger created -> Response recorded -> Summary toggle");
    try {
      // Step 1: Send a coding message via CLI
      const chatRes = await fetch(`${BASE}/api/cli/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "List the files in the current directory",
          agentId: "test-e2e",
          autoMode: true,
          sessionType: "project",
          sessionTitle: "E2E Test Project",
        }),
        signal: AbortSignal.timeout(60000),
      });
      assert(chatRes.ok, "CLI chat returns 200");

      // Step 2: Parse SSE stream
      const sseText = await chatRes.text();
      const sseLines = sseText.split("\n").filter((l) => l.startsWith("data: "));
      let sessionId = null;
      let gotDelta = false;
      let gotDone = false;

      for (const line of sseLines) {
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.ledgerSessionId) sessionId = evt.ledgerSessionId;
          if (evt.type === "delta") gotDelta = true;
          if (evt.type === "done" || evt.type === "end") gotDone = true;
        } catch { /* skip */ }
      }

      assert(sessionId !== null, "Ledger session ID returned in stream");
      assert(gotDelta, "Received delta events (streaming text)");
      assert(gotDone, "Received completion event");

      // Step 3: Verify ledger was created
      if (sessionId) {
        const sessRes = await fetch(`${BASE}/api/cli/sessions/${sessionId}`, {
          signal: AbortSignal.timeout(5000),
        });
        const sessMeta = await sessRes.json();
        assert(sessMeta.type === "project", "Session type is project");
        assert(sessMeta.title === "E2E Test Project", "Session title correct");
        assert(sessMeta.messageCount >= 2, "Has user + assistant messages");

        // Step 4: Verify ledger markdown
        const ledgerRes = await fetch(`${BASE}/api/cli/sessions/${sessionId}/ledger`, {
          signal: AbortSignal.timeout(5000),
        });
        const ledgerMd = await ledgerRes.text();
        assert(ledgerMd.includes("List the files"), "Ledger contains user message");
        assert(ledgerMd.includes("] Assistant"), "Ledger contains assistant response");

        // Step 5: Get messages in both modes
        const fullRes = await fetch(`${BASE}/api/cli/sessions/${sessionId}/messages?view=full`, {
          signal: AbortSignal.timeout(5000),
        });
        const fullMsgs = await fullRes.json();
        assert(fullMsgs.length >= 2, "Full view has messages");

        // Step 6: Generate summary
        const assistantMsg = fullMsgs.find((m) => m.type === "cli_response");
        if (assistantMsg) {
          const sumRes = await fetch(`${BASE}/api/cli/sessions/${sessionId}/summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              responseId: assistantMsg.id,
              content: assistantMsg.content,
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (sumRes.ok) {
            const sumData = await sumRes.json();
            assert(typeof sumData.summary === "string", "Summary generated");
            assert(sumData.summary.length < assistantMsg.content.length, "Summary is shorter than full response");
          } else {
            skip("Summary generation (shre-router may not be running)");
          }
        }

        // Step 7: Send follow-up (tests context injection)
        const followRes = await fetch(`${BASE}/api/cli/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "What did I just ask you?",
            agentId: "test-e2e",
            autoMode: true,
          }),
          signal: AbortSignal.timeout(60000),
        });
        assert(followRes.ok, "Follow-up message succeeds");

        // Verify same session was reused
        const updatedSess = await (await fetch(`${BASE}/api/cli/sessions/${sessionId}`, {
          signal: AbortSignal.timeout(5000),
        })).json();
        assert(updatedSess.messageCount >= 4, "Session has 4+ messages after follow-up");

        // Step 8: Close session
        const closeRes = await fetch(`${BASE}/api/cli/sessions/${sessionId}/close`, {
          method: "POST",
          signal: AbortSignal.timeout(5000),
        });
        const closedMeta = await closeRes.json();
        assert(closedMeta.status === "completed", "Session completed");

        // Cleanup
        try {
          const dir = join(LEDGER_ROOT, sessionId);
          if (existsSync(dir)) rmSync(dir, { recursive: true });
        } catch { /* best effort */ }
      }
    } catch (err) {
      assert(false, `E2E flow: ${err.message}`);
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────
console.log("\n\x1b[1m=== RESULTS ===\x1b[0m");
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Skipped: ${skipped}`);
if (failures.length > 0) {
  console.log("\n  \x1b[31mFailures:\x1b[0m");
  failures.forEach((f) => console.log(`    - ${f}`));
}
console.log();

process.exit(failed > 0 ? 1 : 0);
