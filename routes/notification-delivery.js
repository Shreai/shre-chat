// @ts-check
// Notification delivery routes — Slack, email, and local notification config
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

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
 * @property {Record<string, string>} slackWebhookRoutes
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
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
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
    const config = loadConfig();
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
    const config = loadConfig();
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
        emailToConfigured: !!process.env.SHRE_NOTIFICATION_EMAIL_TO,
      },
      shreChat: { enabled: true },
      path: CONFIG_PATH,
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
          slackWebhookUrl: typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : loadConfig().slackWebhookUrl,
          slackWebhookRoutes: body.slackWebhookRoutes && typeof body.slackWebhookRoutes === "object" && !Array.isArray(body.slackWebhookRoutes)
            ? Object.fromEntries(
                Object.entries(body.slackWebhookRoutes)
                  .filter(([, url]) => typeof url === "string" && url.trim())
                  .map(([key, url]) => [String(key).trim(), url.trim()]),
              )
            : loadConfig().slackWebhookRoutes,
          emailEnabled: !!body.emailEnabled,
          emailTo: typeof body.emailTo === "string" ? body.emailTo.trim() : loadConfig().emailTo,
          emailAccount: typeof body.emailAccount === "string" ? body.emailAccount.trim() || DEFAULT_EMAIL_ACCOUNT : loadConfig().emailAccount,
          importantOnly: body.importantOnly !== undefined ? !!body.importantOnly : loadConfig().importantOnly,
        };
        saveConfig(next);
        cachedConfig = next;
        return json(res, { ok: true, ...getStatus() });
      } catch (error) {
        log.error("Failed to save notification delivery config", {}, error);
        return json(res, { error: "Failed to save config" }, 500);
      }
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
