// Stub shre-sdk for Replit environment

export function createLogger(name) {
  const prefix = `[${name}]`;
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    debug: (...args) => console.debug(prefix, ...args),
    child: (meta) => createLogger(`${name}:${Object.values(meta).join(':')}`),
  };
}

export function extractCorrelationId(req) {
  return req?.headers?.['x-correlation-id'] || null;
}

export function createEventBus(name) {
  const listeners = {};
  return {
    emit: (event, data) => {
      (listeners[event] || []).forEach(fn => fn(data));
    },
    publish: async (event, level, data) => {
      (listeners[event] || []).forEach(fn => fn(data));
    },
    on: (event, fn) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    subscribe: async (event, fn) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return () => { listeners[event] = (listeners[event] || []).filter(f => f !== fn); };
    },
    off: (event, fn) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(f => f !== fn);
      }
    },
    shutdown: async () => {},
  };
}

export function createLifecycleEmitter(eventBus, name, opts) {
  return {
    ready: () => console.log(`[${name}] ready on port ${opts?.port}`),
    started: () => console.log(`[${name}] started`),
    stopping: (signal) => console.log(`[${name}] stopping (${signal})`),
    shutdown: () => console.log(`[${name}] shutting down`),
  };
}

// Import from discovery.js (reads ports.json — single source of truth)
export { serviceUrl, infraUrl } from "./discovery.js";

import { serviceUrl as _svcUrl } from "./discovery.js";

export function createServiceClient(caller) {
  return {
    async call(service, path, opts = {}) {
      const url = `${_svcUrl(service)}${path}`;
      const res = await fetch(url, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json", "x-caller": caller, ...(opts.headers || {}) },
        ...(opts.body ? { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) } : {}),
        signal: opts.signal || AbortSignal.timeout(opts.timeoutMs || 10000),
      });
      return res.json();
    },
    async fetch(service, path, opts = {}) {
      const url = `${_svcUrl(service)}${path}`;
      return globalThis.fetch(url, {
        method: opts.method || "GET",
        headers: { "x-caller": caller, ...(opts.headers || {}) },
        ...(opts.body ? { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) } : {}),
        signal: opts.signal || AbortSignal.timeout(opts.timeoutMs || 300000),
      });
    },
    async healthy(service) {
      try {
        const res = await globalThis.fetch(`${_svcUrl(service)}/health`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
      } catch { return false; }
    },
  };
}

export function createFeedbackPipeline(opts) {
  return {
    submit: async (feedback) => {},
    start: () => {},
    stop: async () => {},
    reportKnowledgeLearned: async (type, content, source) => {},
  };
}

export default {};
