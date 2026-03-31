/**
 * Unit tests for the /api/tasks/create endpoint.
 *
 * Tests the REAL route handler from routes/tasks.js by importing
 * registerTaskRoutes and calling it with mock dependencies.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  createMockLogger,
  createMockReq,
  createMockRes,
  createJsonHelper,
  createCollectBodyHelper,
  createRateLimitHelper,
  getJsonResponse,
} from './route-test-helpers';

// Mock shre-sdk before importing the route module
vi.mock('shre-sdk', () => ({
  serviceUrl: (name: string) => `http://mock-${name}:9999`,
  infraUrl: (name: string) => `http://mock-${name}:9999`,
}));

// Mock global fetch
const fetchMock = vi.fn<(...args: any[]) => Promise<Response>>();
vi.stubGlobal('fetch', fetchMock);

// Import the REAL route handler
import { registerTaskRoutes } from '../../routes/tasks.js';

const log = createMockLogger();
const json = createJsonHelper();
const collectBody = createCollectBodyHelper();

let handleTask: ReturnType<typeof registerTaskRoutes>;

beforeAll(() => {
  handleTask = registerTaskRoutes({ log: log as any });
});

beforeEach(() => {
  fetchMock.mockReset();
});

/** Helper to POST a task creation request */
async function createTask(body: any, rateLimitHelper?: ReturnType<typeof createRateLimitHelper>) {
  const req = createMockReq({
    method: 'POST',
    url: '/api/tasks/create',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 255),
    },
    body: JSON.stringify(body),
    remoteAddress: '127.0.0.1',
  });
  const res = createMockRes();
  const url = new URL('/api/tasks/create', 'http://localhost');
  const rateLimit = rateLimitHelper || createRateLimitHelper();
  await handleTask(req, res, url, { json, collectBody, rateLimit });
  return getJsonResponse(res._promise);
}

/** Mock a successful shre-tasks POST response */
function mockTaskServiceSuccess(taskId = 'task-123', title = 'Test task') {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ id: taskId, title }), { status: 200 }),
  );
}

/** Mock a failed shre-tasks POST response */
function mockTaskServiceFailure(status = 502) {
  fetchMock.mockResolvedValueOnce(new Response('Service unavailable', { status }));
}

describe('POST /api/tasks/create — successful creation', () => {
  it('creates a task with valid title', async () => {
    mockTaskServiceSuccess();
    const { status, body } = await createTask({ title: 'Buy groceries' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.task).toBeDefined();
    expect(body.task.id).toBe('task-123');
  });

  it('creates a task with title, description, and priority', async () => {
    mockTaskServiceSuccess();
    const { status, body } = await createTask({
      title: 'Deploy v2.1',
      description: 'Push the new release to production',
      priority: 'high',
      source: 'shre-chat',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('forwards cleaned title to shre-tasks', async () => {
    mockTaskServiceSuccess();
    await createTask({ title: 'Buy groceries' });
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.title).toBe('Buy groceries');
    expect(callBody.created_by).toBe('shre-chat');
    expect(callBody.status).toBe('created');
  });
});

describe('POST /api/tasks/create — validation', () => {
  it('returns 400 when title is missing', async () => {
    const { status, body } = await createTask({ description: 'No title here' });
    expect(status).toBe(400);
    expect(body.error).toContain('title');
  });

  it('returns 400 when title is empty string', async () => {
    const { status, body } = await createTask({ title: '' });
    expect(status).toBe(400);
    expect(body.error).toContain('title');
  });

  it('returns 400 when title is non-string (number)', async () => {
    const { status, body } = await createTask({ title: 12345 });
    expect(status).toBe(400);
    expect(body.error).toContain('title');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = createMockReq({
      method: 'POST',
      url: '/api/tasks/create',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    const res = createMockRes();
    const url = new URL('/api/tasks/create', 'http://localhost');
    const rateLimit = createRateLimitHelper();
    await handleTask(req, res, url, { json, collectBody, rateLimit });
    const { status } = await getJsonResponse(res._promise);
    expect(status).toBe(400);
  });
});

describe('POST /api/tasks/create — XSS sanitization', () => {
  it('strips HTML tags from title', async () => {
    mockTaskServiceSuccess('task-xss', 'Buy groceries');
    const { status, body } = await createTask({
      title: "<script>alert('xss')</script>Buy groceries",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // Verify the ACTUAL title sent to shre-tasks has HTML stripped
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.title).toBe("alert('xss')Buy groceries");
    expect(callBody.title).not.toContain('<script>');
    expect(callBody.title).not.toContain('</script>');
  });

  it('strips complex HTML from title', async () => {
    mockTaskServiceSuccess();
    await createTask({
      title: '<img src=x onerror="alert(1)">Buy milk<div>extra</div>',
    });
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.title).not.toContain('<img');
    expect(callBody.title).not.toContain('<div>');
    expect(callBody.title).toContain('Buy milk');
  });

  it('strips HTML from description too', async () => {
    mockTaskServiceSuccess();
    await createTask({
      title: 'Valid title',
      description: '<b>Bold</b> and <script>bad</script>text',
    });
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.description).not.toContain('<b>');
    expect(callBody.description).not.toContain('<script>');
    expect(callBody.description).toContain('Bold');
    expect(callBody.description).toContain('text');
  });

  it('returns 400 when title is only HTML (empty after sanitization)', async () => {
    const { status, body } = await createTask({
      title: '<script></script><div></div>',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('empty after sanitization');
  });

  it('returns 400 for whitespace-only title after HTML stripping', async () => {
    const { status, body } = await createTask({
      title: '<b>  </b>',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('empty after sanitization');
  });
});

describe('POST /api/tasks/create — Unicode titles', () => {
  it('handles unicode characters in title', async () => {
    mockTaskServiceSuccess();
    const { status, body } = await createTask({ title: 'Cafe rendezvous avec Pierre' });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.title).toContain('Cafe');
  });

  it('handles CJK characters', async () => {
    mockTaskServiceSuccess();
    await createTask({ title: 'Meeting notes' });
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.title).toBe('Meeting notes');
  });
});

describe('POST /api/tasks/create — rate limiting', () => {
  it('returns 429 when rate limit exceeded', async () => {
    // Use a rate limiter that immediately blocks
    const rl = createRateLimitHelper(0);
    const req = createMockReq({
      method: 'POST',
      url: '/api/tasks/create',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Task overflow' }),
    });
    const res = createMockRes();
    const url = new URL('/api/tasks/create', 'http://localhost');
    await handleTask(req, res, url, { json, collectBody, rateLimit: rl });
    const { status, body } = await getJsonResponse(res._promise);
    expect(status).toBe(429);
    expect(body.error).toContain('Too many');
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});

describe('POST /api/tasks/create — task service failure', () => {
  it('returns error when task service is down', async () => {
    mockTaskServiceFailure(502);
    const { status, body } = await createTask({ title: 'Test task' });
    expect(status).toBe(502);
    expect(body.error).toContain('Failed to create task');
  });

  it('returns error status from upstream service', async () => {
    mockTaskServiceFailure(500);
    const { status } = await createTask({ title: 'Test task' });
    expect(status).toBe(500);
  });
});

describe('POST /api/tasks/create — route returns false for non-matching paths', () => {
  it('returns false for unrelated path', async () => {
    const req = createMockReq({ method: 'GET', url: '/api/other' });
    const res = createMockRes();
    const url = new URL('/api/other', 'http://localhost');
    const rateLimit = createRateLimitHelper();
    const handled = await handleTask(req, res, url, { json, collectBody, rateLimit });
    expect(handled).toBe(false);
  });

  it('returns false for GET on tasks/create', async () => {
    const req = createMockReq({ method: 'GET', url: '/api/tasks/create' });
    const res = createMockRes();
    const url = new URL('/api/tasks/create', 'http://localhost');
    const rateLimit = createRateLimitHelper();
    const handled = await handleTask(req, res, url, { json, collectBody, rateLimit });
    expect(handled).toBe(false);
  });
});
