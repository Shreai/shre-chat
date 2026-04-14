// Stub shre-sdk/discovery — reads from ports.json (single source of truth)

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _ports = null;
function loadPorts() {
  if (_ports) return _ports;
  // Walk up from stubs/shre-sdk/ to find ports.json at repo root
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    try {
      const candidate = join(dir, "ports.json");
      const raw = readFileSync(candidate, "utf-8");
      _ports = JSON.parse(raw);
      return _ports;
    } catch {
      dir = dirname(dir);
    }
  }
  // Hardcoded fallback if ports.json not found
  _ports = { services: {}, infrastructure: {} };
  return _ports;
}

export function serviceUrl(name) {
  const ports = loadPorts();
  let entry = ports.services?.[name];
  let isInfra = false;

  if (!entry) {
    entry = ports.infrastructure?.[name];
    isInfra = true;
  }

  if (!entry) {
    return `http://127.0.0.1:8000`; // unknown fallback
  }

  const forceHttp = process.env.SHRE_FORCE_HTTP !== '0'; // default: true
  const protocol = forceHttp ? 'http' : (entry.protocol || 'http');

  const host = process.env[`SHRE_HOST_${name.toUpperCase().replace(/-/g, "_")}`]
    || process.env.SHRE_NODE_HOST || entry.host || "127.0.0.1";
  return `${protocol}://${host}:${entry.port}`;
}

export function infraUrl(name) {
  return serviceUrl(name);
}

export default { serviceUrl, infraUrl };
