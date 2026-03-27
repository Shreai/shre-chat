// Stub trace module for shre-chat
export function createTraceMiddleware() {
  return (req, res, next) => { if (next) next(); };
}
export function getRecentTraces() { return []; }
export function getRecentFailures() { return []; }
export function getTraceStats() { return { total: 0, failed: 0, avgDuration: 0 }; }
