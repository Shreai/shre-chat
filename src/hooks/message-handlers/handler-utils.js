/**
 * Shared utilities for message handlers.
 * Extracted from useMessageHandlers.ts.
 */
import { mib007Link } from '../../chat-utils';
/** Version stamp for the default system prompt — bump when prompt logic changes. */
export const SYSTEM_PROMPT_VERSION = '1.0.0';
/**
 * Validate custom system prompt — reject injection patterns and excessive length.
 * Returns the prompt if safe, or null if it should be discarded.
 */
export function validateCustomPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string')
        return null;
    const MAX_CHARS = 14_000;
    if (prompt.length > MAX_CHARS) {
        console.warn('[shre] Custom system prompt exceeds length limit, using default', {
            length: prompt.length,
            max: MAX_CHARS,
        });
        return null;
    }
    const INJECTION_PATTERNS = [
        /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|context)/i,
        /disregard\s+(all\s+)?previous/i,
        /forget\s+(everything|all|your)\s*(previous|prior|above)/i,
        /you\s+are\s+now\s+(?!an?\s+AI\s+agent)/i,
        /new\s+identity|new\s+persona|pretend\s+to\s+be/i,
        /override\s+(system|default|base)\s+(prompt|instructions?)/i,
        /do\s+not\s+follow\s+(the\s+)?(system|default|previous)/i,
        /\bsystem\s*:\s*\{/i,
        /<\/?system>/i,
    ];
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(prompt)) {
            console.warn('[shre] Custom system prompt contains injection pattern, using default', {
                pattern: pattern.source,
            });
            return null;
        }
    }
    return prompt;
}
/** Build the default system prompt for an agent. */
export function buildDefaultSystemPrompt(agentName, agentId) {
    return `[prompt-version: ${SYSTEM_PROMPT_VERSION}] You are ${agentName}, an AI agent (${agentId}) in the Nirlab ecosystem. You serve Nir, the founder of Nirlab Inc. Be intelligent, concise, and proactive. Keep responses focused and actionable. Use markdown when helpful.

UI Capabilities: This chat app has a Preview tab that renders HTML. When the user asks you to create or show HTML content (pages, charts, dashboards, visualizations), output it in a \`\`\`html code block. The user can click "Preview" in the sidebar and "Load from Chat" to render it live \u2014 do NOT tell them to save as a file. You can generate full HTML pages with inline CSS and JavaScript.

Task Management: You can help manage tasks and todos. When the user asks to create, check, update, or manage tasks:
- To create a task: tell the user what you're creating, and include "create task: [title]" in your response so the system auto-creates it
- To check task status: the user's tasks are tracked in the system \u2014 reference them by what was discussed
- To link to tasks: use [View Tasks](${mib007Link('tasks')}) or [View Issues](${mib007Link('issues')})
- Available MIB007 views: [Tasks](${mib007Link('tasks')}), [Issues](${mib007Link('issues')}), [Skills](${mib007Link('skills')}), [Agents](${mib007Link('agents')})

Conversation Memory: You have access to the full conversation in this session. When the user references earlier discussions ("what did we talk about", "the task I mentioned", "status update"), look through the conversation history to find the relevant context. Never say you don't remember \u2014 the history is right here. Summarize what was discussed and provide updates.`;
}
