// @ts-check
// Notification delivery routes — Slack, email, and local notification config
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

const CONFIG_DIR = join(homedir(), ".shre");
const CONFIG_PATH = join(CONFIG_DIR, "shre-chat-notification-delivery.json");
const VAULT_PATH = join(CONFIG_DIR, "vault", "shre-chat-notification-delivery.vault");
const VAULT_KEY_PATH = join(CONFIG_DIR, ".vault-key");
const SEND_EMAIL_SCRIPT = join(import.meta.dirname, "..", "..", "shre-gmail", "send-email.mjs");
const DEFAULT_EMAIL_ACCOUNT = process.env.SHRE_NOTIFICATION_EMAIL_ACCOUNT || "default";
const INGEST_TTL_MS = 15 * 60_000;
const secureLinks = new Map();

const IMPORTANT_TYPES = new Set([
  "task.failed",
  "task.unblocked",
  "service.unhealthy",
  "service.started",
  "fleet.agent.dead",
  "fleet.agent.crash_unrecoverable",
  "fleet.task.degraded",
  "fleet.done-gate.failed",
  "deploy.monitor.breach",
  "approval.requested",
  "approval.resolved",
]);

/** @typedef {object} NotificationDeliveryConfig */
/**
 * @typedef {object} NotificationDeliveryConfig
 * @property {boolean} slackEnabled
 * @property {string} slackWebhookUrl
 * @property {Record<string, string>} slackWebhookRoutes
 * @property {string} emailTo
 * @property {boolean} emailEnabled
 * @property {string} emailAccount
 * @property {boolean} importantOnly
 */

/** @type {NotificationDeliveryConfig} */
const DEFAULT_CONFIG = {
  slackEnabled: !!process.env.SHRE_SLACK_WEBHOOK_URL,
  slackWebhookUrl: process.env.SHRE_SLACK_WEBHOOK_URL || "",
  slackWebhookRoutes: parseWebhookRoutes(process.env.SHRE_SLACK_WEBHOOK_ROUTES || ""),
  emailEnabled: !!process.env.SHRE_NOTIFICATION_EMAIL_TO,
  emailTo: "",
  emailAccount: DEFAULT_EMAIL_ACCOUNT,
  importantOnly: true,
};

function parseWebhookRoutes(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, url]) => typeof url === "string" && url.trim())
        .map(([key, url]) => [String(key).trim(), url.trim()]),
    );
  } catch {
    return {};
  }
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function getVaultKey() {
  try {
    if (existsSync(VAULT_KEY_PATH)) {
      const raw = readFileSync(VAULT_KEY_PATH, "utf8").trim();
      if (raw) return raw.includes(":") ? raw.split(":").pop() : raw;
    }
    ensureDir(CONFIG_DIR);
    const key = randomBytes(32).toString("hex");
    writeFileSync(VAULT_KEY_PATH, key, { mode: 0o600 });
    return key;
  } catch {
    return null;
  }
}

function encryptJson(value) {
  const key = getVaultKey();
  if (!key) throw new Error("missing-vault-key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `ENC:gcm:${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("base64")}`;
}

function decryptJson(raw) {
  const key = getVaultKey();
  if (!key) throw new Error("missing-vault-key");
  if (!raw.startsWith("ENC:")) return JSON.parse(raw);
  const [, algo, ivHex, tagHex, data] = raw.split(":");
  if (algo !== "gcm") throw new Error("unsupported-vault-format");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * @returns {NotificationDeliveryConfig}
 */
function loadConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      slackEnabled: raw?.slackEnabled ?? DEFAULT_CONFIG.slackEnabled,
      slackWebhookUrl: typeof raw?.slackWebhookUrl === "string" ? raw.slackWebhookUrl : DEFAULT_CONFIG.slackWebhookUrl,
      slackWebhookRoutes: raw?.slackWebhookRoutes && typeof raw.slackWebhookRoutes === "object" && !Array.isArray(raw.slackWebhookRoutes)
        ? Object.fromEntries(
            Object.entries(raw.slackWebhookRoutes)
              .filter(([, url]) => typeof url === "string" && url.trim())
              .map(([key, url]) => [String(key).trim(), url.trim()]),
          )
        : DEFAULT_CONFIG.slackWebhookRoutes,
      emailEnabled: raw?.emailEnabled ?? DEFAULT_CONFIG.emailEnabled,
      emailTo: typeof raw?.emailTo === "string" ? raw.emailTo : DEFAULT_CONFIG.emailTo,
      emailAccount: typeof raw?.emailAccount === "string" ? raw.emailAccount : DEFAULT_CONFIG.emailAccount,
      importantOnly: raw?.importantOnly ?? DEFAULT_CONFIG.importantOnly,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * @param {NotificationDeliveryConfig} config
 */
function saveConfig(config) {
  ensureDir(CONFIG_DIR);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function loadSecrets() {
  try {
    if (!existsSync(VAULT_PATH)) {
      return {
        slackWebhookUrl: DEFAULT_CONFIG.slackWebhookUrl,
        slackWebhookRoutes: DEFAULT_CONFIG.slackWebhookRoutes,
        emailTo: DEFAULT_CONFIG.emailTo,
      };
    }
    const raw = readFileSync(VAULT_PATH, "utf8").trim();
    if (!raw) {
      return {
        slackWebhookUrl: DEFAULT_CONFIG.slackWebhookUrl,
        slackWebhookRoutes: DEFAULT_CONFIG.slackWebhookRoutes,
        emailTo: DEFAULT_CONFIG.emailTo,
      };
    }
    const parsed = decryptJson(raw);
    return {
      slackWebhookUrl: typeof parsed?.slackWebhookUrl === "string" ? parsed.slackWebhookUrl : DEFAULT_CONFIG.slackWebhookUrl,
      slackWebhookRoutes: parsed?.slackWebhookRoutes && typeof parsed.slackWebhookRoutes === "object" && !Array.isArray(parsed.slackWebhookRoutes)
        ? Object.fromEntries(
            Object.entries(parsed.slackWebhookRoutes)
              .filter(([, url]) => typeof url === "string" && url.trim())
              .map(([key, url]) => [String(key).trim(), url.trim()]),
          )
        : DEFAULT_CONFIG.slackWebhookRoutes,
      emailTo: typeof parsed?.emailTo === "string" ? parsed.emailTo : DEFAULT_CONFIG.emailTo,
    };
  } catch {
    return {
      slackWebhookUrl: DEFAULT_CONFIG.slackWebhookUrl,
      slackWebhookRoutes: DEFAULT_CONFIG.slackWebhookRoutes,
      emailTo: DEFAULT_CONFIG.emailTo,
    };
  }
}

function saveSecrets(secrets) {
  ensureDir(join(CONFIG_DIR, "vault"));
  writeFileSync(VAULT_PATH, encryptJson(secrets), { mode: 0o600 });
}

function createSecureLink(baseUrl) {
  const token = randomUUID().replace(/-/g, "");
  secureLinks.set(token, { expiresAt: Date.now() + INGEST_TTL_MS, used: false });
  return `${baseUrl.replace(/\/$/, "")}/api/notification-delivery/ingest/${token}`;
}

function getSecureLinkState(token) {
  const entry = secureLinks.get(token);
  if (!entry) return null;
  if (entry.used || Date.now() > entry.expiresAt) {
    secureLinks.delete(token);
    return null;
  }
  return entry;
}

function consumeSecureLink(token) {
  const entry = getSecureLinkState(token);
  if (!entry) return false;
  entry.used = true;
  secureLinks.set(token, entry);
  return true;
}

function renderSecureIngestPage(token) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shre Chat Secure Secret Ingest</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; margin: 0; background: #0b1020; color: #e5e7eb; }
    .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 48px; }
    .card { background: #111827; border: 1px solid #243043; border-radius: 16px; padding: 20px; box-shadow: 0 16px 40px rgba(0,0,0,.25); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #9ca3af; line-height: 1.5; }
    textarea, input { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid #334155; background: #0f172a; color: #e5e7eb; padding: 12px 14px; font: inherit; }
    textarea { min-height: 240px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .row { display: grid; gap: 12px; margin-top: 16px; }
    button { background: #4f46e5; color: white; border: 0; border-radius: 12px; padding: 12px 16px; font-weight: 600; cursor: pointer; }
    .hint { font-size: 12px; color: #94a3b8; }
    .ok { background: rgba(34,197,94,.12); color: #86efac; border: 1px solid rgba(34,197,94,.25); padding: 12px 14px; border-radius: 12px; white-space: pre-wrap; }
    .bad { background: rgba(239,68,68,.12); color: #fca5a5; border: 1px solid rgba(239,68,68,.25); padding: 12px 14px; border-radius: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Secure Secret Ingest</h1>
      <p>Paste Slack webhook URLs, route maps, and notification recipient details here. The payload is stored encrypted in the local vault and this link expires after one use.</p>
      <div class="hint">Token: ${token.slice(0, 8)}…</div>
      <form id="form" class="row">
        <label>
          <div class="hint">JSON payload</div>
          <textarea id="payload" placeholder='{"slackWebhookUrl":"https://hooks.slack.com/services/...","slackWebhookRoutes":{"fleet":"https://hooks.slack.com/services/..."},"emailTo":"alerts@example.com"}'></textarea>
        </label>
        <button type="submit">Save to Vault</button>
      </form>
      <div id="result" style="margin-top:16px;"></div>
    </div>
  </div>
  <script>
    const form = document.getElementById('form');
    const payload = document.getElementById('payload');
    const result = document.getElementById('result');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      result.innerHTML = '';
      try {
        const data = JSON.parse(payload.value);
        const res = await fetch(location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const text = await res.text();
        result.innerHTML = '<div class="' + (res.ok ? 'ok' : 'bad') + '">' + text.replace(/</g, '&lt;') + '</div>';
      } catch (err) {
        result.innerHTML = '<div class="bad">' + String(err.message || err) + '</div>';
      }
    });
  </script>
</body>
</html>`;
}

function mergeEffectiveConfig() {
  const config = loadConfig();
  const secrets = loadSecrets();
  return {
    ...config,
    slackWebhookUrl: secrets.slackWebhookUrl || config.slackWebhookUrl,
    slackWebhookRoutes: Object.keys(secrets.slackWebhookRoutes || {}).length > 0
      ? secrets.slackWebhookRoutes
      : config.slackWebhookRoutes,
    emailTo: secrets.emailTo || config.emailTo,
  };
}

function maskValue(value) {
  if (!value) return "";
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function maskRoutes(routes) {
  return Object.fromEntries(
    Object.entries(routes || {}).map(([key, url]) => [key, maskValue(url)]),
  );
}

function isExternalAlert(type, data) {
  if (IMPORTANT_TYPES.has(type)) return true;
  const severity = String(data?.severity || data?.level || "").toLowerCase();
  if (severity === "critical" || severity === "high") return true;
  return false;
}

function buildSlackText(payload) {
  const lines = [
    `*${payload.title || payload.type}*`,
    payload.body ? `${payload.body}` : "",
    `Type: ${payload.type}`,
    payload.source ? `Source: ${payload.source}` : "",
    payload.url ? `Link: ${payload.url}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function pickSlackWebhookUrl(config, payload) {
  const routingKey = String(
    payload?.routingKey ||
      payload?.workspaceId ||
      payload?.projectId ||
      payload?.source ||
      payload?.service ||
      payload?.type ||
      "",
  ).trim();
  if (routingKey && config.slackWebhookRoutes?.[routingKey]) return config.slackWebhookRoutes[routingKey];
  if (routingKey) {
    const lower = routingKey.toLowerCase();
    const matchedKey = Object.keys(config.slackWebhookRoutes || {}).find((key) => key.toLowerCase() === lower);
    if (matchedKey) return config.slackWebhookRoutes[matchedKey];
  }
  return config.slackWebhookUrl || process.env.SHRE_SLACK_WEBHOOK_URL || "";
}

function buildEmailSubject(payload) {
  return `[Shre Chat] ${payload.title || payload.type}`;
}

function buildEmailBody(payload) {
  return [
    `${payload.title || payload.type}`,
    "",
    payload.body || "",
    "",
    `Type: ${payload.type}`,
    payload.source ? `Source: ${payload.source}` : "",
    payload.url ? `Link: ${payload.url}` : "",
    payload.ts ? `Timestamp: ${new Date(payload.ts).toISOString()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function spawnEmail(to, subject, body, account) {
  return new Promise((resolve) => {
    const child = spawn("node", [SEND_EMAIL_SCRIPT, to, subject, "ENV_BODY", account || DEFAULT_EMAIL_ACCOUNT], {
      env: { ...process.env, SHRE_EMAIL_BODY: body },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => resolve({ ok: false, error: error.message }));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, stdout: stdout.trim() });
      } else {
        resolve({ ok: false, error: stderr.trim() || stdout.trim() || `exit ${code}` });
      }
    });
  });
}

async function sendSlackNotification(payload, config, log) {
  const webhookUrl = pickSlackWebhookUrl(config, payload);
  if (!config.slackEnabled || !webhookUrl) return { ok: false, skipped: true };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: buildSlackText(payload),
        username: "Shre Chat",
        icon_emoji: ":speech_balloon:",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn("Slack delivery failed", { status: res.status, body: body.slice(0, 200) });
      return { ok: false, error: `Slack responded ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    log.warn("Slack delivery failed", { error: String(error) });
    return { ok: false, error: String(error) };
  }
}

async function sendEmailNotification(payload, config, log) {
  const to = config.emailTo || process.env.SHRE_NOTIFICATION_EMAIL_TO || "";
  if (!config.emailEnabled || !to) return { ok: false, skipped: true };
  const subject = buildEmailSubject(payload);
  const body = buildEmailBody(payload);
  const result = await spawnEmail(to, subject, body, config.emailAccount || DEFAULT_EMAIL_ACCOUNT);
  if (!result.ok) {
    log.warn("Email delivery failed", { to, error: result.error });
  }
  return result;
}

/**
 * Register notification delivery routes.
 * @param {{ log: import('shre-sdk').Logger }} deps
 */
export function registerNotificationDeliveryRoutes({ log }) {
  let cachedConfig = loadConfig();

  async function deliverNotification(payload, opts = {}) {
    const config = mergeEffectiveConfig();
    const type = payload?.type || "notification";
    const shouldDeliver = opts.force || isExternalAlert(type, payload) || !config.importantOnly;
    if (!shouldDeliver) {
      return { skipped: true, reason: "not_important" };
    }

    const channelResults = {};
    const requestedChannels = Array.isArray(opts.channels) && opts.channels.length > 0
      ? new Set(opts.channels)
      : new Set(["slack", "email"]);

    if (requestedChannels.has("slack")) {
      channelResults.slack = await sendSlackNotification(payload, config, log);
    }
    if (requestedChannels.has("email")) {
      channelResults.email = await sendEmailNotification(payload, config, log);
    }

    return { ok: true, channels: channelResults };
  }

  function getStatus() {
    const config = mergeEffectiveConfig();
    return {
      config: {
        slackEnabled: config.slackEnabled,
        slackWebhookUrl: maskValue(config.slackWebhookUrl),
        slackWebhookRoutes: maskRoutes(config.slackWebhookRoutes),
        emailEnabled: config.emailEnabled,
        emailTo: config.emailTo,
        emailAccount: config.emailAccount,
        importantOnly: config.importantOnly,
      },
      env: {
        slackWebhookConfigured: !!process.env.SHRE_SLACK_WEBHOOK_URL,
        slackWebhookRoutesConfigured: !!process.env.SHRE_SLACK_WEBHOOK_ROUTES,
        emailToConfigured: !!process.env.SHRE_NOTIFICATION_EMAIL_TO,
      },
      shreChat: { enabled: true },
      path: CONFIG_PATH,
      vaultPath: VAULT_PATH,
    };
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   * @param {{ json: Function, collectBody: Function }} helpers
   */
  async function handleNotificationDeliveryRoute(req, res, url, { json, collectBody }) {
    if (url.pathname === "/api/notification-delivery/status" && req.method === "GET") {
      return json(res, getStatus());
    }

    if (url.pathname === "/api/notification-delivery/config" && req.method === "GET") {
      return json(res, { ...getStatus(), raw: loadConfig() });
    }

    if (url.pathname === "/api/notification-delivery/config" && req.method === "PUT") {
      let body;
      try {
        body = await collectBody(req);
      } catch {
        return json(res, { error: "Body too large" }, 413);
      }
      try {
        const next = {
          ...loadConfig(),
          slackEnabled: !!body.slackEnabled,
          emailEnabled: !!body.emailEnabled,
          emailAccount: typeof body.emailAccount === "string" ? body.emailAccount.trim() || DEFAULT_EMAIL_ACCOUNT : loadConfig().emailAccount,
          importantOnly: body.importantOnly !== undefined ? !!body.importantOnly : loadConfig().importantOnly,
        };
        saveConfig(next);
        if (
          body.slackWebhookUrl !== undefined ||
          body.slackWebhookRoutes !== undefined ||
          body.emailTo !== undefined
        ) {
          const secrets = {
            ...loadSecrets(),
            slackWebhookUrl: typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : loadSecrets().slackWebhookUrl,
            slackWebhookRoutes: body.slackWebhookRoutes && typeof body.slackWebhookRoutes === "object" && !Array.isArray(body.slackWebhookRoutes)
              ? Object.fromEntries(
                  Object.entries(body.slackWebhookRoutes)
                    .filter(([, url]) => typeof url === "string" && url.trim())
                    .map(([key, url]) => [String(key).trim(), url.trim()]),
                )
              : loadSecrets().slackWebhookRoutes,
            emailTo: typeof body.emailTo === "string" ? body.emailTo.trim() : loadSecrets().emailTo,
          };
          saveSecrets(secrets);
        }
        cachedConfig = next;
        return json(res, { ok: true, ...getStatus() });
      } catch (error) {
        log.error("Failed to save notification delivery config", {}, error);
        return json(res, { error: "Failed to save config" }, 500);
      }
    }

    if (url.pathname === "/api/notification-delivery/secure-link" && req.method === "POST") {
      const origin = url.origin || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost:5510"}`;
      const link = createSecureLink(origin);
      return json(res, { ok: true, url: link, expiresInMs: INGEST_TTL_MS });
    }

    const ingestMatch = url.pathname.match(/^\/api\/notification-delivery\/ingest\/([A-Za-z0-9-]+)$/);
    if (ingestMatch) {
      const token = ingestMatch[1];
      const entry = getSecureLinkState(token);
      if (!entry) {
        return json(res, { error: "Link expired or already used" }, 410);
      }

      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(renderSecureIngestPage(token));
        return true;
      }

      if (req.method === "POST") {
        let body;
        try {
          body = await collectBody(req);
        } catch {
          return json(res, { error: "Body too large" }, 413);
        }
        try {
          const secrets = {
            slackWebhookUrl: typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : "",
            slackWebhookRoutes: body.slackWebhookRoutes && typeof body.slackWebhookRoutes === "object" && !Array.isArray(body.slackWebhookRoutes)
              ? Object.fromEntries(
                  Object.entries(body.slackWebhookRoutes)
                    .filter(([, url]) => typeof url === "string" && url.trim())
                    .map(([key, url]) => [String(key).trim(), url.trim()]),
                )
              : {},
            emailTo: typeof body.emailTo === "string" ? body.emailTo.trim() : "",
          };
          if (!secrets.slackWebhookUrl && Object.keys(secrets.slackWebhookRoutes).length === 0 && !secrets.emailTo) {
            return json(res, { error: "No secrets provided" }, 400);
          }
          saveSecrets(secrets);
          consumeSecureLink(token);
          return json(res, { ok: true, message: "Secrets saved to vault" });
        } catch (error) {
          log.error("Failed to save secrets to vault", {}, error);
          return json(res, { error: "Failed to save secrets" }, 500);
        }
      }
    }

    if (url.pathname === "/api/notification-delivery/secure-link" && req.method === "GET") {
      const origin = url.origin || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost:5510"}`;
      const link = createSecureLink(origin);
      return json(res, { ok: true, url: link, expiresInMs: INGEST_TTL_MS });
    }

    if (url.pathname === "/api/notification-delivery/test" && req.method === "POST") {
      let body;
      try {
        body = await collectBody(req);
      } catch {
        return json(res, { error: "Body too large" }, 413);
      }
      const payload = {
        type: body.type || "notification.test",
        title: body.title || "Shre Chat test notification",
        body: body.body || "This is a test notification from Shre Chat.",
        source: body.source || "shre-chat",
        url: body.url || "/",
        ts: Date.now(),
      };
      const channels = Array.isArray(body.channels) ? body.channels : undefined;
      const result = await deliverNotification(payload, { force: true, channels });
      return json(res, { ok: true, result, config: getStatus() });
    }

    return false;
  }

  return {
    handleNotificationDeliveryRoute,
    deliverNotification,
    getNotificationDeliveryStatus: getStatus,
    getCachedNotificationDeliveryConfig: () => cachedConfig,
  };
}
