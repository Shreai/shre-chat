// @ts-check
// Health routes — /api/health and /api/readyz
import { infraUrl } from "shre-sdk";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} HealthDeps
 * @property {import('shre-sdk').Logger} log
 * @property {number} PORT
 * @property {object|null} tlsOpts
 * @property {string} GATEWAY_TOKEN
 * @property {() => number} getActiveCLICount
 * @property {() => any} getActivePty
 */

/**
 * @typedef {object} HealthResponse
 * @property {boolean} ok
 * @property {string} service
 * @property {number} port
 * @property {number} uptime
 * @property {boolean} tls
 * @property {boolean} gatewayToken
 * @property {number} activeCLI
 * @property {number} maxCLI
 * @property {boolean} activeTerminal
 * @property {string} timestamp
 * @property {{ rss: number, heap: number }} memory
 */

/**
 * Register health routes.
 * @param {HealthDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function }) => Promise<boolean>}
 */
export function registerHealthRoutes({ log, PORT, tlsOpts, GATEWAY_TOKEN, getActiveCLICount, getActivePty }) {

  return async function handleHealthRoute(req, res, url, { json }) {

    // ── Health endpoint (both /health and /api/health for platform compatibility) ──
    if ((url.pathname === "/health" || url.pathname === "/api/health") && req.method === "GET") {
      json(res, {
        ok: true,
        service: "shre-chat",
        port: PORT,
        uptime: Math.round(process.uptime()),
        tls: !!tlsOpts,
        gatewayToken: !!GATEWAY_TOKEN,
        activeCLI: getActiveCLICount(),
        maxCLI: 2,
        activeTerminal: !!getActivePty(),
        timestamp: new Date().toISOString(),
        memory: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
      });
      return true;
    }

    // ── Readyz — check gateway reachability ──
    if ((url.pathname === "/readyz" || url.pathname === "/api/readyz") && req.method === "GET") {
      try {
        const r = await fetch(`${infraUrl("shre-router")}/health`, { signal: AbortSignal.timeout(2000) });
        if (!r.ok) return json(res, { ready: false, reason: "router gateway unhealthy" }, 503);
        json(res, { ready: true });
        return true;
      } catch {
        json(res, { ready: false, reason: "router gateway unreachable" }, 503);
        return true;
      }
    }

    return false;
  };
}
