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

export function serviceUrl(name) {
  const ports = {
    'mib007': 'http://127.0.0.1:5500',
    'shre-router': 'http://127.0.0.1:5497',
    'shre-tasks': 'http://127.0.0.1:5460',
    'shre-fleet': 'http://127.0.0.1:5498',
  };
  return ports[name] || `http://127.0.0.1:8000`;
}

export function infraUrl(name) {
  const ports = {
    'openclaw-gateway': 'http://127.0.0.1:18789',
    'cortexservice-api': 'http://127.0.0.1:7000',
  };
  return ports[name] || `http://127.0.0.1:8000`;
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
