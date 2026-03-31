// @ts-check
// Suggestions route — AI-powered follow-up suggestions
import { serviceUrl } from "shre-sdk";

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {object} Reminder
 * @property {string} text
 * @property {boolean} completed
 * @property {string} [due]
 * @property {string} [snoozed]
 */

/**
 * @typedef {object} SuggestionsDeps
 * @property {import('shre-sdk').Logger} log
 * @property {(userId?: string, tenantId?: string) => Reminder[]} loadReminders
 * @property {(req: IncomingMessage) => { userId: string, tenantId: string }} getUserContext
 * @property {() => { sections?: { tasks?: { overdue?: number } } } | null} getBriefingCache
 */

/**
 * Register suggestions routes.
 * @param {SuggestionsDeps} deps
 * @returns {(req: IncomingMessage, res: ServerResponse, url: URL, helpers: { json: Function }) => boolean}
 */
export function registerSuggestionsRoutes({ log, loadReminders, getUserContext, getBriefingCache }) {

  return function handleSuggestionsRoute(req, res, url, { json }) {

    if (url.pathname === "/api/suggestions" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", async () => {
        try {
          const { context } = JSON.parse(body);
          const truncated = (context || "").slice(0, 500);
          let contextHints = "";
          try {
            const { userId, tenantId } = getUserContext(req);
            const reminders = loadReminders(userId, tenantId);
            const overdueReminders = reminders.filter(r => !r.completed && new Date(r.snoozed || r.due) < new Date());
            if (overdueReminders.length > 0) contextHints += `\nUser has ${overdueReminders.length} overdue reminders: ${overdueReminders.slice(0, 3).map(r => r.text).join(", ")}.`;
            const hour = new Date().getHours();
            if (hour < 10) contextHints += "\nIt's morning — consider suggesting daily planning tasks.";
            else if (hour >= 17) contextHints += "\nIt's end of day — consider suggesting wrap-up or summary tasks.";
            const briefingCache = getBriefingCache();
            if (briefingCache?.sections?.tasks?.overdue > 0) contextHints += `\nUser has ${briefingCache.sections.tasks.overdue} overdue tasks.`;
          } catch { /* ignore */ }
          const routerRes = await fetch(`${serviceUrl("shre-router")}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "anthropic/claude-haiku-4-5",
              max_tokens: 200,
              messages: [{ role: "user", content: `Based on this conversation, suggest 3 brief follow-up questions the user might ask. Consider the user's current context:${contextHints}\n\nReply with ONLY a JSON array of 3 strings, no other text. Last assistant message: ${truncated}` }],
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (routerRes.ok) {
            const parsed = await routerRes.json();
            const text = parsed?.choices?.[0]?.message?.content || "";
            const match = text.match(/\[[\s\S]*?\]/);
            if (match) {
              const arr = JSON.parse(match[0]);
              if (Array.isArray(arr)) { json(res, { suggestions: arr.slice(0, 3) }); return; }
            }
          }
          json(res, { suggestions: [] });
        } catch { json(res, { suggestions: [] }); }
      });
      return true;
    }

    return false;
  };
}
