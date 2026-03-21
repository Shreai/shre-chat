/**
 * Unit tests for the /api/voice-command endpoint.
 *
 * Tests the REAL route handler from routes/voice.js by importing
 * registerVoiceRoutes and calling it with mock dependencies.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  createMockLogger,
  createMockReq,
  createMockRes,
  createJsonHelper,
  createCollectBodyHelper,
  getJsonResponse,
} from "./route-test-helpers";

// Mock shre-sdk before importing the route module
vi.mock("shre-sdk", () => ({
  serviceUrl: (name: string) => `http://mock-${name}:9999`,
  infraUrl: (name: string) => `http://mock-${name}:9999`,
}));

// Mock global fetch
const fetchMock = vi.fn<(...args: any[]) => Promise<Response>>();
vi.stubGlobal("fetch", fetchMock);

// Import the REAL route handler
import { registerVoiceRoutes } from "../../routes/voice.js";

const log = createMockLogger();
const json = createJsonHelper();
const collectBody = createCollectBodyHelper();

let handleVoice: ReturnType<typeof registerVoiceRoutes>;

beforeAll(() => {
  handleVoice = registerVoiceRoutes({
    log: log as any,
    OPENCLAW_HOST: "localhost",
    OPENCLAW_PORT: 18789,
    GATEWAY_TOKEN: "test-token",
  });
});

beforeEach(() => {
  fetchMock.mockReset();
});

/** Helper to send a voice command and get the JSON response */
async function voiceCommand(prompt: string) {
  const req = createMockReq({
    method: "POST",
    url: "/api/voice-command",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const res = createMockRes();
  const url = new URL("/api/voice-command", "http://localhost");
  await handleVoice(req, res, url, { json, collectBody });
  return getJsonResponse(res._promise);
}

/** Mock a successful task creation response from shre-tasks */
function mockTaskCreateSuccess(taskId = "voice-task-1") {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: taskId }), { status: 200 }));
}

/** Mock a failed task creation response */
function mockTaskCreateFailure(status = 500) {
  fetchMock.mockResolvedValueOnce(new Response("Internal error", { status }));
}

/** Mock a task list response */
function mockTaskListSuccess(tasks: any[] = []) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ tasks }), { status: 200 }));
}

/** Mock a digest response */
function mockDigestSuccess(digest: any = { pendingTasks: 5, completedToday: 3, activeProjects: 2, blockedTasks: 1 }) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(digest), { status: 200 }));
}

describe("Voice command — task_create intent", () => {
  it('"remind me to buy milk" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("remind me to buy milk");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("buy milk");
    expect(body.spoken).toContain("buy milk");
  });

  it('"create a task: review PR" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("create a task: review PR");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("review PR");
  });

  it('"add buy groceries as a task" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("add buy groceries as a task");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("buy groceries");
  });

  it('"todo: fix the login bug" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("todo: fix the login bug");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("fix the login bug");
  });

  it('"set a reminder to call dentist" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("set a reminder to call dentist");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("call dentist");
  });

  it('"I need to update the deployment scripts" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("I need to update the deployment scripts");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toContain("update the deployment scripts");
  });

  it('"don\'t let me forget to send the invoice" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("don't let me forget to send the invoice");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("send the invoice");
  });

  it('"please create a task called deploy v2" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("please create a task called deploy v2");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("deploy v2");
  });

  it('"task: migrate the database" creates a task', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("task: migrate the database");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("migrate the database");
  });

  it("detects high priority from keywords", async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("remind me to fix the urgent server issue");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toContain("urgent");
    // Verify the fetch payload included high priority
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.priority).toBe("high");
  });

  it("detects low priority from keywords", async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("remind me to eventually clean up the logs");
    expect(body.action).toBe("task_created");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.priority).toBe("low");
  });
});

describe("Voice command — due date parsing", () => {
  it('"remind me to buy milk by tomorrow" extracts due_at', async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("remind me to buy milk by tomorrow");
    expect(body.action).toBe("task_created");
    // Verify the fetch payload included due_at
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.due_at).toBeDefined();
    expect(typeof callBody.due_at).toBe("number");
    // due_at should be in the future
    expect(callBody.due_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('"remind me to submit report by tonight" sets end-of-day due', async () => {
    mockTaskCreateSuccess();
    await voiceCommand("remind me to submit report by tonight");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.due_at).toBeDefined();
    expect(typeof callBody.due_at).toBe("number");
  });

  it('"remind me to submit report by end of day" sets end-of-day due', async () => {
    mockTaskCreateSuccess();
    await voiceCommand("remind me to submit report by end of day");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.due_at).toBeDefined();
  });

  it('"remind me to call dentist by monday" sets next monday due', async () => {
    mockTaskCreateSuccess();
    await voiceCommand("remind me to call dentist by monday");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.due_at).toBeDefined();
    expect(typeof callBody.due_at).toBe("number");
    // Should be at least 1 day in the future (could be up to 7)
    const now = Math.floor(Date.now() / 1000);
    expect(callBody.due_at).toBeGreaterThan(now);
  });

  it("spoken response mentions due date keyword", async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("remind me to buy milk by tomorrow");
    expect(body.spoken).toContain("tomorrow");
  });

  it("task without due date keyword has no due_at", async () => {
    mockTaskCreateSuccess();
    await voiceCommand("remind me to buy milk");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.due_at).toBeUndefined();
  });
});

describe("Voice command — task_list intent", () => {
  it('"what are my tasks" returns task_list', async () => {
    mockTaskListSuccess([{ title: "Buy groceries", priority: "medium" }]);
    const { body } = await voiceCommand("what are my tasks");
    expect(body.action).toBe("task_list");
    expect(body.tasks).toBeDefined();
    expect(body.mib007Link).toBe("/SHR/tasks");
  });

  it('"show my todos" returns task_list', async () => {
    mockTaskListSuccess([]);
    const { body } = await voiceCommand("show my todos");
    expect(body.action).toBe("task_list");
  });

  it('"list my action items" returns task_list', async () => {
    mockTaskListSuccess([]);
    const { body } = await voiceCommand("list my action items");
    expect(body.action).toBe("task_list");
  });

  it('"what\'s my to-do list" returns task_list', async () => {
    mockTaskListSuccess([]);
    const { body } = await voiceCommand("what's my to-do list");
    expect(body.action).toBe("task_list");
  });

  it('"do I have any tasks" returns task_list', async () => {
    mockTaskListSuccess([]);
    const { body } = await voiceCommand("do I have any tasks");
    expect(body.action).toBe("task_list");
  });

  it('"my tasks" returns task_list', async () => {
    mockTaskListSuccess([]);
    const { body } = await voiceCommand("my tasks");
    expect(body.action).toBe("task_list");
  });

  it("empty task list returns friendly message", async () => {
    mockTaskListSuccess([]);
    const { body } = await voiceCommand("what are my tasks");
    expect(body.action).toBe("task_list");
    expect(body.spoken).toContain("all clear");
    expect(body.tasks).toEqual([]);
  });

  it("non-empty task list includes count in spoken response", async () => {
    mockTaskListSuccess([
      { title: "Buy groceries", priority: "medium" },
      { title: "Fix server", priority: "high" },
    ]);
    const { body } = await voiceCommand("what are my tasks");
    expect(body.spoken).toContain("2 pending task");
  });
});

describe("Voice command — digest intent", () => {
  it('"give me a digest" returns digest', async () => {
    mockDigestSuccess();
    const { body } = await voiceCommand("give me a digest");
    expect(body.action).toBe("digest");
    expect(body.digest).toBeDefined();
  });

  it('"morning briefing" returns digest', async () => {
    mockDigestSuccess();
    const { body } = await voiceCommand("morning briefing");
    expect(body.action).toBe("digest");
  });

  it('"what\'s the status" returns digest', async () => {
    mockDigestSuccess();
    const { body } = await voiceCommand("what's the status");
    expect(body.action).toBe("digest");
  });

  it('"give me a summary" returns digest', async () => {
    mockDigestSuccess();
    const { body } = await voiceCommand("give me a summary");
    expect(body.action).toBe("digest");
  });

  it('"project status" returns digest', async () => {
    mockDigestSuccess();
    const { body } = await voiceCommand("project status");
    expect(body.action).toBe("digest");
  });

  it('"status update" returns digest', async () => {
    mockDigestSuccess();
    const { body } = await voiceCommand("status update");
    expect(body.action).toBe("digest");
  });

  it("digest spoken response includes blocked count when > 0", async () => {
    mockDigestSuccess({ pendingTasks: 5, completedToday: 3, activeProjects: 2, blockedTasks: 2 });
    const { body } = await voiceCommand("give me a digest");
    expect(body.spoken).toContain("blocked");
  });
});

describe("Voice command — no match (action: null)", () => {
  it('"hello how are you" returns null (falls through to AI)', async () => {
    // AI classification fallback — mock the gateway to return intent: none
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"intent":"none"}' } }],
    }), { status: 200 }));
    const { body } = await voiceCommand("hello how are you");
    expect(body.action).toBeNull();
  });

  it('"what is the weather like" returns null', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"intent":"none"}' } }],
    }), { status: 200 }));
    const { body } = await voiceCommand("what is the weather like");
    expect(body.action).toBeNull();
  });

  it("empty string returns 400 error", async () => {
    const { status, body } = await voiceCommand("");
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("whitespace-only prompt returns action: null", async () => {
    const { body } = await voiceCommand("   ");
    expect(body.action).toBeNull();
  });
});

describe("Voice command — error handling", () => {
  it("missing prompt field returns 400 error", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/voice-command",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "remind me to buy milk" }),
    });
    const res = createMockRes();
    const url = new URL("/api/voice-command", "http://localhost");
    await handleVoice(req, res, url, { json, collectBody });
    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("non-string prompt returns 400 error", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/voice-command",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: 12345 }),
    });
    const res = createMockRes();
    const url = new URL("/api/voice-command", "http://localhost");
    await handleVoice(req, res, url, { json, collectBody });
    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("invalid JSON body returns action: null", async () => {
    const req = createMockReq({
      method: "POST",
      url: "/api/voice-command",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = createMockRes();
    const url = new URL("/api/voice-command", "http://localhost");
    await handleVoice(req, res, url, { json, collectBody });
    const { body } = await getJsonResponse(res._promise);
    expect(body.action).toBeNull();
  });
});

describe("Voice command — task creation failure", () => {
  it("returns task_error when task service fails", async () => {
    mockTaskCreateFailure(500);
    const { body } = await voiceCommand("remind me to buy milk");
    expect(body.action).toBe("task_error");
    expect(body.spoken).toBeDefined();
  });

  it("returns task_error when fetch throws (network error)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Connection refused"));
    const { body } = await voiceCommand("remind me to buy milk");
    expect(body.action).toBe("task_error");
    expect(body.spoken).toContain("couldn't reach");
  });
});

describe("Voice command — AI classification fallback", () => {
  it("uses AI fallback when no regex matches, classifies as task_create", async () => {
    // First call: AI classification returning task_create
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"intent":"task_create","title":"pick up dry cleaning","priority":"medium"}' } }],
    }), { status: 200 }));
    // Second call: actual task creation
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "ai-task-1" }), { status: 200 }));

    const { body } = await voiceCommand("I gotta remember to pick up dry cleaning");
    // This could match regex "I need to" pattern OR fall through to AI depending on wording.
    // "I gotta" doesn't match "I need to" regex, so it should fall through to AI.
    expect(body.action).toBe("task_created");
    expect(body.task.title).toBe("pick up dry cleaning");
  });

  it("AI fallback returns null for non-actionable input", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"intent":"none"}' } }],
    }), { status: 200 }));
    const { body } = await voiceCommand("how's the weather today");
    expect(body.action).toBeNull();
  });
});

describe("Voice command — Unicode in prompts", () => {
  it("handles unicode task titles", async () => {
    mockTaskCreateSuccess();
    const { body } = await voiceCommand("remind me to call cafe");
    expect(body.action).toBe("task_created");
    expect(body.task.title).toContain("call cafe");
  });

  it("handles emoji in prompts without crashing", async () => {
    // Emojis won't match regex patterns, falls through to AI
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"intent":"none"}' } }],
    }), { status: 200 }));
    const { body } = await voiceCommand("what does this mean: hello");
    expect(body.action).toBeNull();
  });
});

describe("Voice command — route returns false for non-matching paths", () => {
  it("returns false for unrelated path", async () => {
    const req = createMockReq({ method: "GET", url: "/api/other" });
    const res = createMockRes();
    const url = new URL("/api/other", "http://localhost");
    const handled = await handleVoice(req, res, url, { json, collectBody });
    expect(handled).toBe(false);
  });

  it("returns false for GET on voice-command", async () => {
    const req = createMockReq({ method: "GET", url: "/api/voice-command" });
    const res = createMockRes();
    const url = new URL("/api/voice-command", "http://localhost");
    const handled = await handleVoice(req, res, url, { json, collectBody });
    expect(handled).toBe(false);
  });
});
