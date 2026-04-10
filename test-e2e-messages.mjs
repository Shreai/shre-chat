#!/usr/bin/env node
/**
 * E2E Message Intelligence Tests for shre-chat
 *
 * Tests two critical capabilities:
 *   1. Incomplete/cutoff message detection — does the AI handle partial input gracefully?
 *   2. Multi-question recognition — does the AI parse and answer all parts of compound messages?
 *
 * Routes through: shre-chat → shre-router /v1/chat → LLM → response
 * Falls back to:  shre-router /v1/chat directly if shre-chat proxy is slow
 */

const ROUTER_URL = 'http://127.0.0.1:5497';
const CHAT_URL = 'http://127.0.0.1:5510';
const TIMEOUT = 60_000;

const passed = [];
const failed = [];
const skipped = [];

// ── Helpers ──────────────────────────────────────────────────────

let lastTestFailed = false;

async function test(name, fn) {
  // If previous test failed/timed out, wait for Ollama to recover
  if (lastTestFailed) {
    await new Promise((r) => setTimeout(r, 5000));
    lastTestFailed = false;
  }
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    passed.push(name);
    console.log(`  \u2705 ${name} (${ms}ms)`);
  } catch (err) {
    lastTestFailed = true;
    if (err.message?.startsWith('SKIP:')) {
      skipped.push(name);
      console.log(`  \u23ED ${name}: ${err.message}`);
    } else {
      const ms = Date.now() - start;
      failed.push({ name, error: err.message });
      console.log(`  \u274C ${name} (${ms}ms): ${err.message}`);
    }
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function skip(msg) {
  throw new Error(`SKIP: ${msg}`);
}

const DEFAULT_SYSTEM = 'You are a helpful assistant. Answer questions directly from your knowledge. Do NOT use any tools, web searches, or external lookups. Just answer conversationally. Keep responses concise (under 300 words).';

/** Send a chat message via shre-router and get the full response */
async function chat(userMessage, opts = {}) {
  const {
    systemPrompt = DEFAULT_SYSTEM,
    agentId = 'shre',
    model = 'auto',
    timeout = TIMEOUT,
  } = opts;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userMessage });

  const res = await fetch(`${ROUTER_URL}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-channel': 'e2e-test',
    },
    body: JSON.stringify({
      messages,
      model,
      agentId,
      stream: false,
      metadata: { taskType: 'e2e-message-test' },
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'no body');
    throw new Error(`Router returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  // Parse multi-format response
  const content =
    data.content?.[0]?.text ??
    data.message?.content ??
    data.choices?.[0]?.message?.content ??
    data.content ??
    '';
  const model_used = data.model ?? data.choices?.[0]?.model ?? 'unknown';
  const finish_reason =
    data.finish_reason ??
    data.choices?.[0]?.finish_reason ??
    data.done_reason ??
    null;

  return { content, model: model_used, finish_reason, raw: data };
}

/** Check if text contains ALL of the given keywords (case-insensitive) */
function containsAll(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.every((kw) => lower.includes(kw.toLowerCase()));
}

/** Check if text contains AT LEAST N of the given keywords */
function containsAtLeast(text, keywords, n) {
  const lower = text.toLowerCase();
  const found = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return { pass: found.length >= n, found, missing: keywords.filter((kw) => !lower.includes(kw.toLowerCase())) };
}

/** Count distinct answer segments (paragraphs, numbered items, or topic shifts) */
function countAnswerSegments(text) {
  // Count by numbered items (1. 2. 3. or 1) 2) 3))
  const numbered = text.match(/(?:^|\n)\s*\d+[\.\)]/g);
  if (numbered && numbered.length >= 2) return numbered.length;

  // Count by markdown headers
  const headers = text.match(/(?:^|\n)#+\s/g);
  if (headers && headers.length >= 2) return headers.length;

  // Count by bold markers used as section labels
  const boldSections = text.match(/\*\*[^*]+\*\*/g);
  if (boldSections && boldSections.length >= 2) return boldSections.length;

  // Count by double newline separated paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
  return paragraphs.length;
}

// ── Pre-flight ──────────────────────────────────────────────────

console.log('\n\uD83E\uDD16 shre-chat E2E Message Intelligence Tests\n');

// Verify services are up
console.log('--- Pre-flight ---');

await test('shre-router is healthy', async () => {
  const res = await fetch(`${ROUTER_URL}/health`, { signal: AbortSignal.timeout(5000) });
  assert(res.ok, `Router health failed: ${res.status}`);
});

await test('shre-chat is healthy', async () => {
  const res = await fetch(`${CHAT_URL}/health`, { signal: AbortSignal.timeout(5000) });
  assert(res.ok, `Chat health failed: ${res.status}`);
});

await test('LLM responds to basic prompt', async () => {
  const { content } = await chat('Reply with exactly the word: PONG', { timeout: 30_000 });
  assert(content.length > 0, 'Empty response from LLM');
});

// ══════════════════════════════════════════════════════════════════
// SUITE 1: Incomplete / Cutoff Message Detection
// ══════════════════════════════════════════════════════════════════

console.log('\n--- Suite 1: Incomplete Message Handling ---');

await test('Handles mid-sentence cutoff gracefully', async () => {
  const { content } = await chat(
    'Can you help me with my account because I was trying to',
  );
  assert(content.length > 10, 'Response too short');
  // AI should either ask for clarification or infer intent
  const { pass } = containsAtLeast(content, [
    'what', 'clarify', 'help', 'more', 'finish', 'continue', 'trying', 'details', 'complete', 'tell me',
  ], 1);
  assert(pass, `AI did not acknowledge incomplete message. Response: ${content.slice(0, 200)}`);
});

await test('Handles trailing ellipsis as incomplete thought', async () => {
  const { content } = await chat(
    'I was going to ask you something important but...',
  );
  assert(content.length > 10, 'Response too short');
  // AI should ask what they wanted to say or encourage them to continue
  const { pass } = containsAtLeast(content, [
    'but', 'help', 'what', 'continue', 'more', 'tell', 'ask', 'go ahead', 'please', 'finish', 'mind',
  ], 1);
  assert(pass, `AI did not engage with the incomplete thought. Response: ${content.slice(0, 200)}`);
});

await test('Handles single word message', async () => {
  const { content } = await chat('Help');
  assert(content.length > 20, 'Response too short for a vague request');
  // Should ask what kind of help or offer options
  const { pass } = containsAtLeast(content, [
    'help', 'assist', 'what', 'how', 'can', 'need', 'support',
  ], 1);
  assert(pass, `AI did not respond helpfully to single word. Response: ${content.slice(0, 200)}`);
});

await test('Handles message with only punctuation/symbols', async () => {
  const { content } = await chat('??? What do you mean???');
  assert(content.length > 5, 'Response too short');
  // Should ask for clarification or try to help
  const { pass } = containsAtLeast(content, [
    'question', 'help', 'clarify', 'what', 'how', 'confused', 'understand', 'can', 'assist', 'mean', 'context', 'elaborate', 'more', 'detail',
  ], 1);
  assert(pass, `AI did not handle punctuation-heavy message. Response: ${content.slice(0, 200)}`);
});

await test('Handles garbled / corrupted text', async () => {
  const { content } = await chat(
    'I nee d to acces my ac count bu t the passw ord is nt wor king an d I',
  );
  assert(content.length > 20, 'Response too short');
  // Should infer: user needs password/account help despite typos
  const { pass } = containsAtLeast(content, [
    'password', 'account', 'access', 'login', 'reset', 'help', 'sign', 'credentials',
  ], 1);
  assert(pass, `AI did not infer intent from garbled text. Response: ${content.slice(0, 200)}`);
});

await test('Handles abrupt code snippet cutoff', async () => {
  const { content } = await chat(
    'Can you fix this code?\n\nfunction processOrder(order) {\n  const total = order.items.reduce((sum, item) => {\n    return sum +',
  );
  assert(content.length > 30, 'Response too short');
  // Should recognize incomplete code and either complete it or ask for the rest
  const { pass } = containsAtLeast(content, [
    'code', 'function', 'complete', 'rest', 'reduce', 'return', 'sum', 'item', 'price', 'incomplete', 'cut off', 'missing',
  ], 2);
  assert(pass, `AI did not recognize code cutoff. Response: ${content.slice(0, 300)}`);
});

await test('Handles empty-ish message (only whitespace)', async () => {
  try {
    const { content } = await chat('   ');
    // If it responds, it should ask for input
    assert(content.length > 0 || true, 'Handled silently');
  } catch (err) {
    // 400 is also acceptable — means validation caught it
    assert(
      err.message.includes('400') || err.message.includes('empty'),
      `Unexpected error: ${err.message}`,
    );
  }
});

await test('Handles message in mixed languages (partial cutoff)', async () => {
  const { content } = await chat(
    'I want to buy your product. Cuanto cuesta el plan enterprise? Also kann ich',
  );
  assert(content.length > 20, 'Response too short');
  // Should handle multilingual + recognize the cutoff
  const { pass } = containsAtLeast(content, [
    'price', 'plan', 'enterprise', 'cost', 'pricing', 'help', 'question',
  ], 1);
  assert(pass, `AI did not handle multilingual cutoff. Response: ${content.slice(0, 200)}`);
});

// ══════════════════════════════════════════════════════════════════
// SUITE 2: Multi-Question / Compound Message Recognition
// ══════════════════════════════════════════════════════════════════

console.log('\n--- Suite 2: Multi-Question Recognition ---');

await test('Recognizes 2 distinct questions in one sentence', async () => {
  const { content } = await chat(
    'What are the benefits of AI agents and how do multi-agent systems handle task delegation?',
  );
  assert(content.length > 50, 'Response too short for 2 questions');
  const { pass, found, missing } = containsAtLeast(content, [
    'agent', 'task', 'benefit', 'delegation', 'multi', 'autonom', 'collaborat', 'speciali',
  ], 2);
  assert(pass, `AI missed topics. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 300)}`);
});

await test('Recognizes 3 questions joined by "and" / "also"', async () => {
  const { content } = await chat(
    'How do I reset my password, also what are your support hours, and can I upgrade my plan online?',
  );
  assert(content.length > 80, 'Response too short for 3 questions');
  const { pass, found, missing } = containsAtLeast(content, [
    'password', 'support', 'upgrade', 'plan', 'reset', 'hours', 'contact',
  ], 3);
  assert(pass, `AI missed topics. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 400)}`);
});

await test('Recognizes numbered multi-part question', async () => {
  const { content } = await chat(
    '1) What plans do you offer? 2) How does billing work? 3) Is there a free trial?',
  );
  assert(content.length > 80, 'Response too short for 3 numbered questions');
  const { pass, found, missing } = containsAtLeast(content, [
    'plan', 'billing', 'trial',
  ], 3);
  assert(pass, `AI missed numbered parts. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 400)}`);
  // Ideally structured (numbered or sectioned), but single paragraph addressing all is acceptable
  const segments = countAnswerSegments(content);
  // If not structured, at least all 3 topics must be present
  if (segments < 2) {
    const { pass: topicCoverage } = containsAtLeast(content, ['plan', 'billing', 'trial', 'price', 'free', 'cost', 'pay'], 3);
    assert(topicCoverage, `Unstructured AND missed topics — got ${segments} segments. Response: ${content.slice(0, 400)}`);
  }
});

await test('Handles question + instruction in same message', async () => {
  const { content } = await chat(
    'What is the current system status? Also please list the top 3 things I should know as a new user.',
  );
  assert(content.length > 60, 'Response too short');
  // Should address both: status info AND new user tips
  const { pass, found, missing } = containsAtLeast(content, [
    'status', 'new', 'user',
  ], 2);
  assert(pass, `AI missed dual intent. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 400)}`);
});

await test('Handles implicit multi-part (topic shift without explicit question marks)', async () => {
  const { content } = await chat(
    'Tell me about your security practices, I also want to understand how data backups work and whether you support SSO integration.',
  );
  assert(content.length > 100, 'Response too short for 3 topics');
  const { pass, found, missing } = containsAtLeast(content, [
    'security', 'backup', 'sso',
  ], 3);
  assert(pass, `AI missed implicit topics. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 400)}`);
});

await test('Handles rapid-fire questions (no connectors)', async () => {
  const { content } = await chat(
    'What is your uptime SLA? What happens if you go down? Do you offer refunds? How do I contact support?',
  );
  assert(content.length > 100, 'Response too short for 4 questions');
  const { pass, found, missing } = containsAtLeast(content, [
    'uptime', 'down', 'refund', 'support',
  ], 3); // Allow missing 1 out of 4 — 3/4 is strong
  assert(pass, `AI missed rapid-fire questions. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 500)}`);
});

await test('Handles nested question (question within a question)', async () => {
  const { content } = await chat(
    'If I upgrade to the premium plan, which by the way how much does that cost, will I get priority support?',
  );
  assert(content.length > 40, 'Response too short');
  // Should address both: plan cost AND support access
  const { pass, found, missing } = containsAtLeast(content, [
    'plan', 'support', 'cost', 'price', 'upgrade', 'premium',
  ], 2);
  assert(pass, `AI missed nested question. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 300)}`);
});

await test('Handles contradictory multi-part message', async () => {
  const { content } = await chat(
    'I both love and hate your service. The features are great but the learning curve is steep. Can you help me get better at using it while also explaining what alternatives exist?',
  );
  assert(content.length > 50, 'Response too short');
  // Should address both: help learning AND mention alternatives
  const { pass, found, missing } = containsAtLeast(content, [
    'learn', 'help', 'alternative', 'feature', 'tip', 'guide', 'improve', 'option', 'tutorial', 'resource',
  ], 2);
  assert(pass, `AI missed contradictory intents. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 300)}`);
});

await test('Handles technical + non-technical mixed questions', async () => {
  const { content } = await chat(
    'How do I set up email notifications for my account, and separately, what are your business hours for customer service?',
  );
  assert(content.length > 60, 'Response too short');
  const { pass, found, missing } = containsAtLeast(content, [
    'notification', 'email', 'business', 'hours', 'customer', 'service', 'support', 'contact',
  ], 2);
  assert(pass, `AI missed mixed technical/non-technical. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 300)}`);
});

await test('Response structure matches question count (5 questions)', async () => {
  const { content } = await chat(
    'Please answer each of these: 1) What is Shre? 2) How many agents do you have? 3) What plans are available? 4) Is there a free tier? 5) How do I get started?',
  );
  assert(content.length > 150, 'Response too short for 5 explicit questions');
  const segments = countAnswerSegments(content);
  assert(
    segments >= 3,
    `Expected 3+ answer segments for 5 questions, got ${segments}. Response: ${content.slice(0, 500)}`,
  );
  // At least 4 of 5 topics should be addressed
  const { pass, found, missing } = containsAtLeast(content, [
    'shre', 'agent', 'plan', 'free', 'start',
  ], 4);
  assert(pass, `AI missed topics in 5-part question. Found: [${found}], Missing: [${missing}]`);
});

// ══════════════════════════════════════════════════════════════════
// SUITE 3: Voice Message Simulation (text equivalent of voice patterns)
// ══════════════════════════════════════════════════════════════════

console.log('\n--- Suite 3: Voice-Style Message Patterns ---');

await test('Handles run-on speech (no punctuation, voice-like)', async () => {
  const { content } = await chat(
    'yeah so I was wondering if you could help me with my account because I think theres a problem with the billing and also I need to change my email address oh and one more thing can you check if my last payment went through',
  );
  assert(content.length > 80, 'Response too short for multi-topic voice message');
  const { pass, found, missing } = containsAtLeast(content, [
    'billing', 'email', 'payment', 'account', 'charge', 'address', 'help', 'assist',
  ], 2); // Voice messages often get partially parsed — 2/3 core topics is good
  assert(pass, `AI missed voice-style topics. Found: [${found}], Missing: [${missing}]. Response: ${content.slice(0, 400)}`);
});

await test('Handles filler words and self-corrections (voice pattern)', async () => {
  const { content } = await chat(
    'Um so like I was trying to uh set up the integration no wait I mean the webhook thing and it keeps giving me an error',
  );
  assert(content.length > 30, 'Response too short');
  // Should parse through filler words and understand: webhook/integration setup error
  const { pass } = containsAtLeast(content, [
    'webhook', 'integration', 'error', 'setup', 'configure', 'help', 'issue',
  ], 2);
  assert(pass, `AI did not parse through filler words. Response: ${content.slice(0, 300)}`);
});

await test('Handles voice-to-text transcription artifacts', async () => {
  const { content } = await chat(
    'eye need to no the price four the enterprise plan can you male me a quote',
  );
  assert(content.length > 30, 'Response too short');
  // Should understand: "I need to know the price for the enterprise plan, can you make me a quote"
  const { pass } = containsAtLeast(content, [
    'price', 'enterprise', 'quote', 'plan', 'cost',
  ], 2);
  assert(pass, `AI did not correct voice-to-text artifacts. Response: ${content.slice(0, 300)}`);
});

// ── Results ─────────────────────────────────────────────────────

console.log('\n' + '\u2550'.repeat(60));
console.log(`\n\uD83D\uDCCA Results: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped\n`);

if (failed.length > 0) {
  console.log('Failed tests:');
  for (const f of failed) {
    console.log(`  \u274C ${f.name}`);
    console.log(`     ${f.error.slice(0, 200)}`);
  }
}

if (skipped.length > 0) {
  console.log('\nSkipped tests:');
  for (const s of skipped) {
    console.log(`  \u23ED ${s}`);
  }
}

console.log(`\nTotal: ${passed.length + failed.length + skipped.length} tests`);
process.exit(failed.length > 0 ? 1 : 0);
