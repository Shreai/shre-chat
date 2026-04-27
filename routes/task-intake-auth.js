// @ts-check
// Shared helper for task-intake calls from shre-chat.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { generateServiceHMAC } from 'shre-sdk/auth';

const SERVICE_NAME = 'shre-chat';

/**
 * Build headers for POSTing to shre-tasks /v1/intake.
 * Adds the legacy service identity HMAC headers expected by shre-tasks.
 * @param {string} path
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Record<string, string>}
 */
export function buildTaskIntakeHeaders(path = '/v1/intake', extraHeaders = {}) {
  const timestamp = Date.now().toString();
  const payload = `${SERVICE_NAME}:${timestamp}`;
  const signature = generateServiceHMAC(SERVICE_NAME, payload);

  const headers = {
    'Content-Type': 'application/json',
    'X-Shre-Service': SERVICE_NAME,
    'X-Shre-Timestamp': timestamp,
    'X-Shre-Signature': signature,
    'X-Shre-Internal': 'true',
    ...extraHeaders,
  };

  return headers;
}

/**
 * Read the shre-tasks bearer token from env or vault.
 * This is the supported auth path for `POST /v1/tasks`.
 */
export function readTasksToken() {
  if (process.env.SHRE_TASKS_TOKEN) return process.env.SHRE_TASKS_TOKEN;
  try {
    return readFileSync(join(homedir(), '.shre', 'vault', 'shre-tasks.token'), 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * Build headers for `POST /v1/tasks` create calls.
 */
export function buildTaskCreateHeaders(extraHeaders = {}) {
  const token = readTasksToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}
