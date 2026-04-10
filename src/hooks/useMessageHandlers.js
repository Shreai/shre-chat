import { useState, useRef, useEffect, useCallback } from 'react';
import { sendMessage, generateAITitle, } from '../router-client';
import { sendChatWS, isWSConnected } from '../gateway-ws';
import { uid, generateTitle, getAgent, } from '../store';
import { playNotifSound, mib007Link } from '../chat-utils';
import { detectMemoryIntent, captureMemory, forgetMemory, listMemories, } from '../memoryDetector';
// ── Extracted modules ──
import { validateCustomPrompt, buildDefaultSystemPrompt, SYSTEM_PROMPT_VERSION, } from './message-handlers/handler-utils';
import { anchorContextIfNeeded, fetchContextSources } from './message-handlers/context-builder';
// Re-export for backward compatibility
export { SYSTEM_PROMPT_VERSION };
export function useMessageHandlers(params) {
    const { input, setInput, streaming, syncing, writeEnabled, activeSessionId, activeAgentId, sessions, messages, filteredMessages, actions, replyToIndex, pendingFiles, setPendingFiles, selectedModel, compareMode, compareModels, setCompareStreams, setCompareWinner, cliMode, routerMode, directMode, claudeCliMode, identityVerified, setIdentityVerified, pendingMessage, setPendingMessage, verifying, setVerifying, ensureSession, executeSlashCommand, extractMention, clearMention, setStreamPhase, setActiveToolName, setCompacting, setPendingApproval, streamStartRef, sendTimeRef, firstTokenTimeRef, startRun, addStep, updateStep, completeRun, processStepRef, processRunIdRef, abortRef, sendingRef, streamBufferRef, streamFlushRaf, bufferToken, flushStreamBuffer, voiceFinalTranscriptRef, pendingEditSendRef, wsConnected, wsReconnecting, recentWSSendRef, virtualizer, userNearBottomRef, setShowJumpToLatest, setSuggestions, setSelectedMsgIndex, voiceMode, } = params;
    const [queue, setQueue] = useState([]);
    const [editingQueueId, setEditingQueueId] = useState(null);
    const [editingQueueText, setEditingQueueText] = useState('');
    const [cliContinue, setCliContinue] = useState(false);
    const sendQueuedRef = useRef(false);
    const autoRetryCountRef = useRef(0);
    const wasStreamingRef = useRef(false);
    const pendingSuggestionSendRef = useRef(false);
    const currentAgent = getAgent(activeAgentId);
    // Gateway WS is disabled — all chat routes through HTTP/SSE via shre-router.
    // No WS state change messages needed (they only caused false "disconnected" noise).
    const generateSuggestions = useCallback(async (assistantResponse) => {
        try {
            const res = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: assistantResponse.slice(0, 500) }),
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok)
                return;
            const data = await res.json();
            if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                setSuggestions(data.suggestions.slice(0, 3));
            }
        }
        catch (err) {
            console.debug('fetch suggestions', err);
        }
    }, [setSuggestions]);
    const verifyIdentity = useCallback(async (code) => {
        setVerifying(true);
        try {
            const res = await fetch('/api/verify-identity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (data.verified) {
                sessionStorage.setItem('shre-identity-verified', 'true');
                setIdentityVerified(true);
                return true;
            }
            return false;
        }
        catch (err) {
            console.warn('identity verify request', err);
            return false;
        }
        finally {
            setVerifying(false);
        }
    }, [setVerifying, setIdentityVerified]);
    const sendFeedbackToRapidRMS = useCallback(async (msgIndex, rating) => {
        const assistantMsg = messages[msgIndex];
        if (!assistantMsg || assistantMsg.role !== 'assistant')
            return;
        let userInput = '';
        for (let k = msgIndex - 1; k >= 0; k--) {
            if (messages[k].role === 'user') {
                userInput = messages[k].content;
                break;
            }
        }
        const workspaceId = activeSessionId ?? 'unknown';
        const feedbackRating = rating === 'like' ? 'positive' : 'negative';
        try {
            const resp = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: assistantMsg.id ?? `${workspaceId}-${msgIndex}`,
                    workspaceId,
                    rating: feedbackRating,
                    agentId: activeAgentId ?? 'shre',
                    userInput: userInput.slice(0, 500),
                    assistantText: assistantMsg.content.slice(0, 500),
                }),
            });
            if (resp.ok) {
                actions.setStatusLine('Feedback saved \u2713');
                setTimeout(() => actions.setStatusLine(null), 2500);
            }
        }
        catch (err) {
            console.debug('save feedback', err);
        }
    }, [messages, activeSessionId, activeAgentId, actions]);
    // CLI mode sender
    const sendViaCLI = useCallback(async (text, sessionId) => {
        const controller = new AbortController();
        abortRef.current = controller;
        let fullResponse = '';
        const isAutoMode = claudeCliMode; // auto mode = --dangerously-skip-permissions
        actions.setStatusLine(isAutoMode ? 'Starting Claude Code (auto)...' : 'Starting Claude CLI...');
        actions.addActivity(sessionId, 'connecting', isAutoMode ? 'Launching Claude Code (autonomous)' : 'Launching Claude CLI');
        try {
            const res = await fetch('/api/cli/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    message: text,
                    continueConversation: cliContinue,
                    agentId: activeAgentId,
                    autoMode: isAutoMode,
                }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const err = await res.text().catch(() => 'CLI unavailable');
                throw new Error(err);
            }
            const reader = res.body?.getReader();
            if (!reader)
                throw new Error('No stream');
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data: '))
                        continue;
                    const raw = line.slice(6).trim();
                    if (!raw)
                        continue;
                    try {
                        const evt = JSON.parse(raw);
                        if (evt.type === 'delta' && evt.text) {
                            fullResponse += evt.text;
                            bufferToken(fullResponse);
                            actions.setStatusLine(isAutoMode ? 'Claude Code executing...' : 'Claude CLI is writing...');
                        }
                        else if (evt.type === 'tool_start') {
                            // Tool execution — show in activity feed
                            const toolLabel = evt.tool === 'Bash'
                                ? `Running: ${(evt.input || '').slice(0, 80)}`
                                : evt.tool === 'Edit'
                                    ? `Editing file`
                                    : evt.tool === 'Write'
                                        ? `Writing file`
                                        : evt.tool === 'Read'
                                            ? `Reading file`
                                            : `Tool: ${evt.tool}`;
                            actions.addActivity(sessionId, 'thinking', toolLabel);
                            actions.setStatusLine(`${evt.tool}...`);
                        }
                        else if (evt.type === 'tool_result') {
                            const status = evt.isError ? 'error' : 'done';
                            const preview = (evt.output || '').slice(0, 120);
                            actions.addActivity(sessionId, status, preview || `Tool ${status}`);
                        }
                        else if (evt.type === 'done') {
                            const finalText = evt.text || fullResponse;
                            if (streamFlushRaf.current) {
                                clearTimeout(streamFlushRaf.current);
                                streamFlushRaf.current = null;
                            }
                            streamBufferRef.current = '';
                            const cliDoneMeta = { route: 'cli' };
                            if (evt.model)
                                cliDoneMeta.model = evt.model;
                            if (sendTimeRef.current > 0)
                                cliDoneMeta.total_ms = String(Date.now() - sendTimeRef.current);
                            if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0)
                                cliDoneMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
                            actions.addMessage(sessionId, {
                                role: 'assistant',
                                content: finalText,
                                timestamp: Date.now(),
                                meta: cliDoneMeta,
                            });
                            actions.setStreamText('');
                            actions.setStreaming(false);
                            actions.setStatusLine(null);
                            actions.addActivity(sessionId, 'done', `${isAutoMode ? 'Code' : 'CLI'} complete${evt.model ? ` (${evt.model})` : ''}${evt.cost ? ` \u2014 $${evt.cost.toFixed(4)}` : ''}`);
                            setCliContinue(true);
                            return;
                        }
                        else if (evt.type === 'error') {
                            throw new Error(evt.error);
                        }
                        else if (evt.type === 'status') {
                            actions.addActivity(sessionId, 'thinking', `${evt.event}${evt.subtype ? `: ${evt.subtype}` : ''}`);
                            actions.setStatusLine(`Claude: ${evt.event || 'processing'}...`);
                        }
                        else if (evt.type === 'end') {
                            if (fullResponse && !evt.code) {
                                if (streamFlushRaf.current) {
                                    clearTimeout(streamFlushRaf.current);
                                    streamFlushRaf.current = null;
                                }
                                streamBufferRef.current = '';
                                const cliEndMeta = { route: 'cli' };
                                if (sendTimeRef.current > 0)
                                    cliEndMeta.total_ms = String(Date.now() - sendTimeRef.current);
                                actions.addMessage(sessionId, {
                                    role: 'assistant',
                                    content: fullResponse,
                                    timestamp: Date.now(),
                                    meta: cliEndMeta,
                                });
                                actions.setStreamText('');
                                actions.setStreaming(false);
                                actions.setStatusLine(null);
                                setCliContinue(true);
                                return;
                            }
                        }
                    }
                    catch (e) {
                        if (e instanceof Error && e.message !== raw)
                            throw e;
                    }
                }
            }
            if (fullResponse) {
                if (streamFlushRaf.current) {
                    clearTimeout(streamFlushRaf.current);
                    streamFlushRaf.current = null;
                }
                streamBufferRef.current = '';
                const cliStreamMeta = { route: 'cli' };
                if (sendTimeRef.current > 0)
                    cliStreamMeta.total_ms = String(Date.now() - sendTimeRef.current);
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: Date.now(),
                    meta: cliStreamMeta,
                });
                actions.setStreamText('');
                actions.setStreaming(false);
                actions.setStatusLine(null);
                setCliContinue(true);
            }
        }
        catch (err) {
            if (streamFlushRaf.current) {
                clearTimeout(streamFlushRaf.current);
                streamFlushRaf.current = null;
            }
            streamBufferRef.current = '';
            const errMsg = err instanceof Error ? err.message : 'CLI error';
            if (fullResponse) {
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: Date.now(),
                });
                actions.setStreamText('');
                actions.setStreaming(false);
                actions.setStatusLine(null);
                actions.addActivity(sessionId, 'error', `CLI error: ${errMsg}`);
            }
            else {
                actions.setStreamText('');
                actions.addActivity(sessionId, 'error', `CLI error: ${errMsg}`);
                throw err;
            }
        }
    }, [cliContinue, actions, bufferToken, flushStreamBuffer, activeAgentId]);
    const handleSend = useCallback(async () => {
        setSelectedMsgIndex(null);
        const text = input.trim();
        if (!text || syncing || !writeEnabled)
            return;
        // Identity verification gate
        if (!identityVerified) {
            if (pendingMessage !== null) {
                setInput('');
                const sessionId = activeSessionId || ensureSession();
                actions.addMessage(sessionId, {
                    role: 'user',
                    content: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
                    timestamp: Date.now(),
                });
                const verified = await verifyIdentity(text);
                if (verified) {
                    actions.addMessage(sessionId, {
                        role: 'assistant',
                        content: 'Identity confirmed. Shre online.',
                        timestamp: Date.now(),
                    });
                    const savedMessage = pendingMessage;
                    setPendingMessage(null);
                    setInput(savedMessage);
                    pendingEditSendRef.current = true;
                    return;
                }
                else {
                    actions.addMessage(sessionId, {
                        role: 'assistant',
                        content: 'Incorrect code. Try again.',
                        timestamp: Date.now(),
                    });
                    setInput('');
                    return;
                }
            }
            const sessionId = activeSessionId || ensureSession();
            setPendingMessage(text);
            setInput('');
            actions.addMessage(sessionId, {
                role: 'assistant',
                content: 'Identity verification required. Please provide the secret code to proceed.',
                timestamp: Date.now(),
            });
            return;
        }
        if (activeSessionId)
            actions.setDraft(activeSessionId, '');
        if (text.startsWith('/')) {
            executeSlashCommand(text.slice(1));
            return;
        }
        // Extract @@mention
        let mentionCleanText = text;
        let effectiveAgentId = activeAgentId;
        if (extractMention) {
            const { cleanText, agentId } = extractMention(text);
            if (agentId) {
                effectiveAgentId = agentId;
                mentionCleanText = cleanText || text;
            }
        }
        if (clearMention)
            clearMention();
        const sendText = mentionCleanText;
        if (streaming) {
            setQueue((prev) => [...prev, { id: uid(), text: sendText }]);
            setInput('');
            return;
        }
        // Compare mode
        if (compareMode && compareModels.length >= 2) {
            sendingRef.current = true;
            const sessionId2 = ensureSession();
            const session2 = sessions.find((s) => s.id === sessionId2);
            queueMicrotask(() => {
                sendingRef.current = false;
            });
            if (session2 && session2.messages.length === 0)
                actions.updateSessionTitle(sessionId2, generateTitle(text));
            actions.addMessage(sessionId2, { role: 'user', content: text, timestamp: Date.now() });
            setInput('');
            setCompareWinner(null);
            const initStreams = {};
            for (const modelId of compareModels)
                initStreams[modelId] = { text: '', done: false };
            setCompareStreams(initStreams);
            actions.setStreaming(true);
            actions.setStatusLine('Comparing models...');
            const currentMessages = session2?.messages ?? [];
            const sysPrompt = `You are ${currentAgent.name}, an AI agent (${currentAgent.id}) in the Nirlab ecosystem. You serve Nir, the founder of Nirlab Inc. Be intelligent, concise, and proactive. Keep responses focused and actionable. Use markdown when helpful.`;
            const promises = compareModels.map(async (modelId) => {
                let fullResp = '';
                try {
                    await sendMessage(text, currentMessages, sysPrompt, {
                        onToken: (token) => {
                            fullResp += token;
                            setCompareStreams((prev) => ({
                                ...prev,
                                [modelId]: { ...prev[modelId], text: fullResp, done: false },
                            }));
                        },
                        onDone: (full) => {
                            setCompareStreams((prev) => ({
                                ...prev,
                                [modelId]: { text: full || fullResp, done: true },
                            }));
                        },
                        onError: (error) => {
                            setCompareStreams((prev) => ({
                                ...prev,
                                [modelId]: { text: fullResp || `Error: ${error}`, done: true, error },
                            }));
                        },
                        onStatus: () => { },
                    }, undefined, undefined, modelId, undefined, routerMode);
                }
                catch (err) {
                    setCompareStreams((prev) => ({
                        ...prev,
                        [modelId]: {
                            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                            done: true,
                            error: String(err),
                        },
                    }));
                }
            });
            Promise.all(promises).then(() => {
                actions.setStreaming(false);
                actions.setStatusLine(null);
                playNotifSound();
            });
            return;
        }
        sendingRef.current = true;
        const sessionId = ensureSession();
        const session = sessions.find((s) => s.id === sessionId);
        queueMicrotask(() => {
            sendingRef.current = false;
        });
        const attachedFiles = [...pendingFiles];
        setPendingFiles([]);
        for (const f of attachedFiles)
            actions.addFile({
                ...f,
                sessionId,
                sessionTitle: session?.title || 'Chat',
                agentId: effectiveAgentId,
            });
        const userMsg = {
            role: 'user',
            content: text,
            timestamp: Date.now(),
            ...(replyToIndex !== null ? { replyTo: replyToIndex } : {}),
        };
        actions.addMessage(sessionId, userMsg);
        actions.setReplyTo(null);
        setInput('');
        voiceFinalTranscriptRef.current = '';
        setSuggestions([]);
        userNearBottomRef.current = true;
        setShowJumpToLatest(false);
        setTimeout(() => {
            virtualizer.scrollToIndex(filteredMessages.length + 2, { align: 'end' });
        }, 50);
        actions.setStreaming(true);
        actions.setStreamText('');
        actions.setStatusLine('Connecting...');
        setStreamPhase('connecting');
        setActiveToolName(null);
        streamStartRef.current = Date.now();
        sendTimeRef.current = Date.now();
        firstTokenTimeRef.current = 0;
        actions.addActivity(sessionId, 'connecting', 'Sending message');
        actions.addFeed(sessionId, 'sent', text.length > 80 ? text.slice(0, 80) + '\u2026' : text);
        // Quick task query
        const lowerText = text.toLowerCase();
        const isTaskQuery = /\b(?:what(?:'s| is| are)\s+(?:my|the)\s+(?:tasks?|to-?do|todos?|pending|action items?)|list\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|show\s+(?:my\s+)?(?:tasks?|to-?do|todos?)|my\s+(?:tasks?|to-?do\s*list|todos?))\b/i.test(lowerText);
        if (isTaskQuery) {
            fetch('/api/voice-command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text }),
                signal: AbortSignal.timeout(8000),
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                if (data?.action === 'task_list' && data.tasks) {
                    const tasks = data.tasks.slice(0, 10);
                    const lines = tasks.map((t) => `- **${t.title}**${t.priority === 'high' || t.priority === 'critical' ? ' _(urgent)_' : ''}${t.status ? ` [${t.status}]` : ''}`);
                    const content = tasks.length === 0
                        ? `You're all clear \u2014 no pending tasks! [Open Tasks](${mib007Link('tasks')})`
                        : `**Your pending tasks (${tasks.length}):**\n${lines.join('\n')}\n\n[View all in MIB007](${mib007Link('tasks')})`;
                    actions.addMessage(sessionId, {
                        role: 'assistant',
                        content,
                        timestamp: Date.now(),
                        meta: { type: 'system' },
                    });
                }
            })
                .catch(() => {
                void 0;
            });
        }
        // Memory commands: "remember that...", "forget that...", "what do you remember?"
        const memoryIntent = detectMemoryIntent(text);
        if (memoryIntent) {
            const handleMemory = async () => {
                try {
                    let result;
                    switch (memoryIntent.action) {
                        case 'capture':
                            result = await captureMemory(memoryIntent.text);
                            break;
                        case 'forget':
                            result = await forgetMemory(memoryIntent.text);
                            break;
                        case 'list':
                            result = await listMemories();
                            break;
                    }
                    if (result.ok) {
                        let content = result.message || 'Done.';
                        // For list action, format the facts nicely
                        if (memoryIntent.action === 'list' && result.facts && result.facts.length > 0) {
                            const lines = result.facts.map((f) => `- **${f.fact}** _(${f.category}, ${(f.confidence * 100).toFixed(0)}% confidence)_`);
                            content = `**What I remember (${result.facts.length} facts):**\n${lines.join('\n')}`;
                        }
                        actions.addMessage(sessionId, {
                            role: 'assistant',
                            content,
                            timestamp: Date.now(),
                            meta: { type: 'system' },
                        });
                    }
                    else {
                        actions.addMessage(sessionId, {
                            role: 'assistant',
                            content: `Memory error: ${result.error}`,
                            timestamp: Date.now(),
                            meta: { type: 'system' },
                        });
                    }
                }
                catch {
                    void 0;
                }
            };
            handleMemory();
            // Don't return — still send the message to the AI for conversational response
        }
        // Process bar
        const runId = `run-${Date.now()}`;
        processRunIdRef.current = runId;
        startRun(runId, sessionId);
        const thinkStepId = addStep(runId, { kind: 'thinking', label: 'Thinking...' });
        processStepRef.current = thinkStepId;
        // Build message text with reply context
        let messageText = sendText;
        const replyMsg = replyToIndex !== null
            ? (filteredMessages[replyToIndex] ?? (session?.messages ?? [])[replyToIndex] ?? null)
            : null;
        if (replyMsg) {
            const replySnippet = replyMsg.content.length > 500 ? replyMsg.content.slice(0, 500) + '...' : replyMsg.content;
            const replyRole = replyMsg.role === 'user' ? 'my earlier message' : 'your earlier response';
            messageText = `[Replying to ${replyRole}]: "${replySnippet}"\n\n${sendText}`;
        }
        // Context anchoring (extracted)
        messageText = anchorContextIfNeeded(text, messageText, replyToIndex, filteredMessages);
        // Attachments
        const attachments = attachedFiles
            .filter((f) => f.dataUrl)
            .map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl }));
        if (attachedFiles.length > 0) {
            const fileNames = attachedFiles.map((f) => f.name).join(', ');
            messageText = `[Attached files: ${fileNames}]\n\n${messageText}`;
            actions.addFeed(sessionId, 'sent', `Attached: ${fileNames}`, {
                files: String(attachedFiles.length),
            });
        }
        // CLI mode
        if (cliMode) {
            try {
                await sendViaCLI(messageText, sessionId);
                return;
            }
            catch (err) {
                console.debug('CLI send failed, falling back', err);
                actions.addActivity(sessionId, 'error', 'CLI unavailable, falling back to gateway');
                actions.addFeed(sessionId, 'fallback', 'Claude CLI failed, using gateway');
                actions.setStatusLine('CLI failed, trying gateway...');
                actions.setStreaming(true);
                actions.setStreamText('');
            }
        }
        // ═══════════════════════════════════════════════════════════
        // ROUTING: Router Gateway (WebSocket) → shre-router (HTTP fallback)
        // ═══════════════════════════════════════════════════════════
        const useRouterWS = isWSConnected();
        if (useRouterWS) {
            actions.addFeed(sessionId, 'gateway', 'Router Gateway (full agent)', { transport: 'ws' });
            actions.addMessage(sessionId, {
                role: 'assistant',
                content: '[system] Routing via Router Gateway (WebSocket)',
                timestamp: Date.now(),
                meta: { system: 'true', type: 'system', event: 'route-change' },
            });
            let fullResponse = '';
            streamBufferRef.current = '';
            const wsResult = await new Promise((resolve) => {
                const safetyTimeout = setTimeout(() => {
                    console.warn('[shre] WS stream safety timeout');
                    resolve({ ok: false, error: 'Stream timeout' });
                }, 120_000);
                const resolveAndClear = (result) => {
                    clearTimeout(safetyTimeout);
                    resolve(result);
                };
                sendChatWS(effectiveAgentId, 'main', messageText, {
                    onToken: (token) => {
                        if (!token)
                            return;
                        if (firstTokenTimeRef.current === 0)
                            firstTokenTimeRef.current = Date.now();
                        fullResponse += token;
                        bufferToken(fullResponse);
                        actions.setStatusLine(`${currentAgent.name} is writing...`);
                        setCompacting(false);
                        if (processStepRef.current !== 'generating') {
                            if (processStepRef.current)
                                updateStep(runId, processStepRef.current, {
                                    status: 'completed',
                                    completedAt: Date.now(),
                                });
                            const gId = addStep(runId, { kind: 'generating', label: 'Writing response...' });
                            processStepRef.current = gId;
                        }
                    },
                    onDone: (full) => {
                        if (streamFlushRaf.current) {
                            clearTimeout(streamFlushRaf.current);
                            streamFlushRaf.current = null;
                        }
                        streamBufferRef.current = '';
                        const wsMeta = {
                            route: 'ws',
                            model: selectedModel
                                ? selectedModel.split('/').pop() || selectedModel
                                : currentAgent.name,
                        };
                        if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0)
                            wsMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
                        if (sendTimeRef.current > 0)
                            wsMeta.total_ms = String(Date.now() - sendTimeRef.current);
                        if (full.trim())
                            actions.addMessage(sessionId, {
                                role: 'assistant',
                                content: full,
                                timestamp: Date.now(),
                                meta: wsMeta,
                            });
                        actions.setStreamText('');
                        actions.setStreaming(false);
                        actions.setStatusLine(null);
                        setCompacting(false);
                        actions.addActivity(sessionId, 'done', 'Response complete');
                        actions.addFeed(sessionId, 'received', `Response (${full.length} chars)`, {
                            transport: 'ws',
                            ...wsMeta,
                        });
                        playNotifSound();
                        const wsSession = sessions.find((s) => s.id === sessionId);
                        if (wsSession && wsSession.title === 'New chat')
                            generateAITitle(text).then((aiTitle) => {
                                actions.updateSessionTitle(sessionId, aiTitle || generateTitle(text));
                            });
                        recentWSSendRef.current = true;
                        setTimeout(() => {
                            recentWSSendRef.current = false;
                        }, 30_000);
                        generateSuggestions(full);
                        addStep(runId, { kind: 'done', label: 'Done' });
                        completeRun(runId);
                        fetch('/api/conversation-log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
                            credentials: 'include',
                            body: JSON.stringify({
                                agentId: effectiveAgentId,
                                userMessage: messageText,
                                assistantResponse: full,
                                model: selectedModel || 'ws',
                                sessionId,
                            }),
                        }).catch(() => {
                            void 0;
                        });
                        resolveAndClear({ ok: true });
                    },
                    onError: (error) => {
                        if (streamFlushRaf.current) {
                            clearTimeout(streamFlushRaf.current);
                            streamFlushRaf.current = null;
                        }
                        streamBufferRef.current = '';
                        actions.setStreamText('');
                        setCompacting(false);
                        actions.addActivity(sessionId, 'error', `WS error: ${error}`);
                        actions.addFeed(sessionId, 'error', `WS: ${error}`);
                        actions.addMessage(sessionId, {
                            role: 'assistant',
                            content: `[system] Connection error: ${error || 'Unknown error'}`,
                            timestamp: Date.now(),
                            meta: { system: 'true', type: 'system', event: 'error' },
                        });
                        addStep(runId, { kind: 'error', label: error || 'Error' });
                        completeRun(runId);
                        resolveAndClear({ ok: false, error });
                    },
                    onStatus: (status) => {
                        if (status === 'compacting' || status === 'summarizing') {
                            setCompacting(true);
                            setStreamPhase('compacting');
                            actions.setStatusLine(null);
                            if (processStepRef.current)
                                updateStep(runId, processStepRef.current, {
                                    status: 'completed',
                                    completedAt: Date.now(),
                                });
                            const cId = addStep(runId, { kind: 'compacting', label: 'Optimizing context...' });
                            processStepRef.current = cId;
                            return;
                        }
                        setCompacting(false);
                        if (status === 'thinking')
                            setStreamPhase('thinking');
                        else if (status === 'planning') {
                            setStreamPhase('planning');
                            if (processStepRef.current)
                                updateStep(runId, processStepRef.current, {
                                    status: 'completed',
                                    completedAt: Date.now(),
                                });
                            const pId = addStep(runId, { kind: 'planning', label: 'Planning strategy...' });
                            processStepRef.current = pId;
                        }
                        else if (status === 'writing') {
                            setStreamPhase('writing');
                            setActiveToolName(null);
                        }
                        else if (status === 'connecting')
                            setStreamPhase('connecting');
                        const summaries = {
                            connecting: 'Connecting...',
                            thinking: `${currentAgent.name} is thinking...`,
                            planning: `${currentAgent.name} is planning strategy...`,
                            writing: `${currentAgent.name} is writing...`,
                        };
                        actions.setStatusLine(summaries[status] || 'Processing...');
                        if (status === 'thinking')
                            updateStep(runId, thinkStepId, { detail: summaries[status] });
                    },
                    onActivity: (text) => {
                        actions.addActivity(sessionId, 'thinking', text.length > 120 ? text.slice(0, 120) + '\u2026' : text);
                        actions.setStatusLine(text.length > 60 ? text.slice(0, 60) + '\u2026' : text);
                        const toolMatch = text.match(/^(?:Using tool|Running|Calling):\s*(.+)/i);
                        if (toolMatch) {
                            setStreamPhase('tool_use');
                            setActiveToolName(toolMatch[1].trim());
                            if (processStepRef.current)
                                updateStep(runId, processStepRef.current, {
                                    status: 'completed',
                                    completedAt: Date.now(),
                                });
                            const sid = addStep(runId, {
                                kind: 'tool_use',
                                label: text.slice(0, 60),
                                toolName: toolMatch[1].trim(),
                            });
                            processStepRef.current = sid;
                        }
                        else {
                            updateStep(runId, processStepRef.current || thinkStepId, { detail: text });
                        }
                    },
                }, selectedModel || undefined, session?.systemPrompt || undefined).catch((err) => {
                    console.warn('[shre] WebSocket send failed:', err);
                    resolveAndClear({ ok: false, error: String(err) });
                });
            });
            if (wsResult.ok)
                return;
            actions.addFeed(sessionId, 'fallback', `WS failed (${wsResult.error}), trying shre-router...`);
            actions.addMessage(sessionId, {
                role: 'assistant',
                content: `[system] WebSocket failed \u2014 falling back to shre-router HTTP`,
                timestamp: Date.now(),
                meta: { system: 'true', type: 'system', event: 'route-fallback' },
            });
            actions.setStatusLine('Falling back to shre-router...');
        }
        // shre-router HTTP
        const routeLabel = selectedModel
            ? `shre-router \u2192 ${selectedModel.split('/')[1] || selectedModel}`
            : 'shre-router (auto)';
        actions.addFeed(sessionId, 'gateway', routeLabel, { transport: 'http' });
        if (!useRouterWS) {
            actions.addMessage(sessionId, {
                role: 'assistant',
                content: `[system] Routing via shre-router${selectedModel ? ` \u2192 ${selectedModel.split('/').pop() || selectedModel}` : ' (auto)'}`,
                timestamp: Date.now(),
                meta: { system: 'true', type: 'system', event: 'route-change' },
            });
        }
        const controller = new AbortController();
        abortRef.current = controller;
        let fullResponse = '';
        let streamStarted = false;
        // Claude CLI state tracking
        let isClaudeCliResponse = false;
        let claudeToolEvents = [];
        let claudeSessionId = '';
        let claudeCost;
        let claudeDuration;
        let claudeModel;
        const allMessages = session?.messages ?? [];
        const currentMessages = replyToIndex !== null ? allMessages.slice(0, replyToIndex + 1) : allMessages;
        // Fetch context (extracted)
        const { taskContext, sessionContext, contextHealth } = await fetchContextSources(sessionId);
        const defaultSystemPrompt = buildDefaultSystemPrompt(currentAgent.name, currentAgent.id);
        const validatedCustomPrompt = session?.systemPrompt
            ? validateCustomPrompt(session.systemPrompt)
            : null;
        const systemPrompt = validatedCustomPrompt
            ? `${validatedCustomPrompt}\n\n${defaultSystemPrompt}${taskContext}${sessionContext}`
            : `${defaultSystemPrompt}${taskContext}${sessionContext}`;
        await sendMessage(messageText, currentMessages, systemPrompt, {
            onToken: (token) => {
                if (firstTokenTimeRef.current === 0)
                    firstTokenTimeRef.current = Date.now();
                fullResponse += token;
                streamBufferRef.current = fullResponse;
                actions.setStreamText(fullResponse);
                actions.setStatusLine(`${currentAgent.name} is writing...`);
                if (!streamStarted) {
                    streamStarted = true;
                    setStreamPhase('writing');
                    actions.addFeed(sessionId, 'streaming', 'Receiving response stream');
                    if (processStepRef.current)
                        updateStep(runId, processStepRef.current, {
                            status: 'completed',
                            completedAt: Date.now(),
                        });
                    const gId = addStep(runId, { kind: 'generating', label: 'Writing response...' });
                    processStepRef.current = gId;
                }
            },
            onDone: (full) => {
                const httpMeta = {
                    route: 'http',
                    model: selectedModel ? selectedModel.split('/').pop() || selectedModel : 'auto',
                };
                if (firstTokenTimeRef.current > 0 && sendTimeRef.current > 0)
                    httpMeta.ttft_ms = String(firstTokenTimeRef.current - sendTimeRef.current);
                if (sendTimeRef.current > 0)
                    httpMeta.total_ms = String(Date.now() - sendTimeRef.current);
                // Attach Claude CLI metadata if this was a Claude CLI response
                if (isClaudeCliResponse) {
                    httpMeta.type = 'claude_cli_response';
                    httpMeta.claudeMode = 'true';
                    if (claudeSessionId)
                        httpMeta.claudeSessionId = claudeSessionId;
                    if (claudeCost != null)
                        httpMeta.claudeCost = String(claudeCost);
                    if (claudeDuration != null)
                        httpMeta.claudeDuration = String(claudeDuration);
                    if (claudeModel)
                        httpMeta.model = claudeModel;
                    httpMeta.route = 'claude-cli';
                    if (claudeToolEvents.length > 0)
                        httpMeta.claudeToolEvents = JSON.stringify(claudeToolEvents);
                }
                if (full.trim())
                    actions.addMessage(sessionId, { role: 'assistant', content: full, meta: httpMeta });
                actions.setStreamText('');
                actions.setStreaming(false);
                actions.setStatusLine(null);
                actions.addActivity(sessionId, 'done', 'Response complete');
                actions.addFeed(sessionId, 'received', `Response (${full.length} chars)`, {
                    transport: 'http',
                    ...httpMeta,
                });
                playNotifSound();
                const httpSession = sessions.find((s) => s.id === sessionId);
                if (httpSession && httpSession.title === 'New chat')
                    generateAITitle(text).then((aiTitle) => {
                        actions.updateSessionTitle(sessionId, aiTitle || generateTitle(text));
                    });
                generateSuggestions(full);
                autoRetryCountRef.current = 0;
                addStep(runId, { kind: 'done', label: 'Done' });
                completeRun(runId);
                fetch('/api/conversation-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
                    credentials: 'include',
                    body: JSON.stringify({
                        agentId: effectiveAgentId,
                        userMessage: messageText,
                        assistantResponse: full,
                        model: selectedModel || 'auto',
                        sessionId,
                    }),
                }).catch(() => {
                    void 0;
                });
            },
            onError: (error) => {
                if (fullResponse) {
                    actions.addMessage(sessionId, { role: 'assistant', content: fullResponse });
                }
                else {
                    let friendlyError = error;
                    // Tool loop exhaustion: not a transient error — retrying the same prompt
                    // will hit the same limit. Show accurate message; escalation already fired.
                    // Check both the prefixed form AND raw iteration keywords (defensive — catches
                    // errors that slipped through router-client.ts classification as "Gateway unavailable — ...iterations...")
                    const isToolLoop = error.startsWith('tool_loop_exhausted:') ||
                        error.includes('maximum iteration') ||
                        (error.includes('iterations') && (error.includes('tool') || error.includes('execution') || error.includes('loop')));
                    if (isToolLoop) {
                        friendlyError =
                            'The AI hit its tool execution limit on this request. Ellie has been notified and will review it. You can try rephrasing or breaking the request into smaller steps.';
                        actions.addMessage(sessionId, { role: 'assistant', content: `\u26a0\ufe0f ${friendlyError}` });
                        actions.setStreamText('');
                        actions.setStreaming(false);
                        actions.setStatusLine(null);
                        actions.addActivity(sessionId, 'error', `Error: ${friendlyError}`);
                        actions.addFeed(sessionId, 'error', friendlyError);
                        addStep(runId, { kind: 'error', label: 'Tool loop exhausted — Ellie notified' });
                        completeRun(runId);
                        return;
                    }
                    const isTransient = !isToolLoop && (error.includes('502') ||
                        error.includes('503') ||
                        error.includes('504') ||
                        error.includes('unreachable') ||
                        error.includes('Gateway unavailable'));
                    if (isTransient && autoRetryCountRef.current < 2) {
                        autoRetryCountRef.current++;
                        actions.setStatusLine(`Gateway hiccup \u2014 retrying (${autoRetryCountRef.current}/2)...`);
                        actions.setStreamText('');
                        actions.setStreaming(false);
                        addStep(runId, {
                            kind: 'error',
                            label: `Transient error \u2014 auto-retry ${autoRetryCountRef.current}`,
                        });
                        completeRun(runId);
                        setTimeout(() => {
                            setInput(messageText);
                            pendingEditSendRef.current = true;
                        }, 2000);
                        return;
                    }
                    if (isTransient)
                        friendlyError = 'Gateway unavailable after retries. Please try again in a moment.';
                    if (error.includes('rate') || error.includes('429'))
                        friendlyError = 'Rate limited \u2014 too many requests. Wait a moment and try again.';
                    else if (error.includes('401') || error.includes('403') || error.includes('auth')) {
                        friendlyError = 'Authentication failed. Check your API keys.';
                        actions.addMessage(sessionId, {
                            role: 'assistant',
                            content: '[system] Session expired \u2014 please sign in again',
                            timestamp: Date.now(),
                            meta: { system: 'true', type: 'system', event: 'session-expired' },
                        });
                    }
                    else if (error.includes('model') && error.includes('not found'))
                        friendlyError = `Model not available. Try switching to a different model.`;
                    else if (error.includes('timeout'))
                        friendlyError = 'Request timed out. The model may be overloaded.';
                    else if (error.includes('fetch') || error.includes('network'))
                        friendlyError = 'Network error. Check your connection.';
                    actions.addMessage(sessionId, {
                        role: 'assistant',
                        content: `Error: ${friendlyError}`,
                    });
                }
                actions.setStreamText('');
                actions.setStreaming(false);
                actions.setStatusLine(null);
                actions.addActivity(sessionId, 'error', `Error: ${error}`);
                actions.addFeed(sessionId, 'error', error);
                addStep(runId, { kind: 'error', label: error || 'Error' });
                completeRun(runId);
            },
            onStatus: (status, detail) => {
                const summaries = {
                    connecting: 'Connecting...',
                    thinking: `${currentAgent.name} is thinking...`,
                    planning: `${currentAgent.name} is planning strategy...`,
                    writing: `${currentAgent.name} is writing...`,
                    researching: detail ? `Researching: ${detail}` : 'Researching...',
                    executing: detail ? `Executing: ${detail}` : 'Executing...',
                    tool_call: detail ? `Using tool: ${detail}` : 'Processing...',
                    done: 'Done',
                    warning: detail || 'Warning',
                    attention: detail || 'Attention needed',
                    error: detail || 'Error occurred',
                };
                actions.setStatusLine(summaries[status] || 'Processing...');
                if (status === 'thinking')
                    setStreamPhase('thinking');
                else if (status === 'planning')
                    setStreamPhase('planning');
                else if (status === 'writing') {
                    setStreamPhase('writing');
                    setActiveToolName(null);
                }
                else if (status === 'connecting')
                    setStreamPhase('connecting');
                else if (status === 'error')
                    setStreamPhase('error');
                else if (status === 'researching' || status === 'executing' || status === 'tool_call') {
                    setStreamPhase('tool_use');
                    setActiveToolName(detail || status);
                }
                if (status === 'planning') {
                    if (processStepRef.current)
                        updateStep(runId, processStepRef.current, {
                            status: 'completed',
                            completedAt: Date.now(),
                        });
                    const pId = addStep(runId, { kind: 'planning', label: 'Planning strategy...' });
                    processStepRef.current = pId;
                }
                else if (status === 'researching' || status === 'executing' || status === 'tool_call') {
                    if (processStepRef.current)
                        updateStep(runId, processStepRef.current, {
                            status: 'completed',
                            completedAt: Date.now(),
                        });
                    const tId = addStep(runId, {
                        kind: 'tool_use',
                        label: detail || status,
                        toolName: detail || undefined,
                    });
                    processStepRef.current = tId;
                }
                if (status === 'thinking' ||
                    status === 'planning' ||
                    status === 'researching' ||
                    status === 'executing' ||
                    status === 'tool_call') {
                    actions.addActivity(sessionId, status, summaries[status] || 'Processing');
                    if (status === 'thinking')
                        actions.addFeed(sessionId, 'routed', 'Model selected, processing');
                    else if (status === 'researching' || status === 'executing' || status === 'tool_call')
                        actions.addFeed(sessionId, 'gateway', summaries[status] || 'Processing', detail ? { tool: detail } : undefined);
                }
            },
            onBillingWarning: (message) => {
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: `[system] ${message}`,
                    timestamp: Date.now(),
                    meta: { system: 'true', type: 'system', event: 'billing-warning' },
                });
                actions.addActivity(sessionId, 'warning', message);
                actions.addFeed(sessionId, 'system', message);
            },
            onApprovalRequired: (approval) => {
                setPendingApproval(approval);
                actions.setStatusLine(`Approval needed: ${approval.reason}`);
                setStreamPhase('attention');
                addStep(runId, { kind: 'approval', label: `Awaiting approval: ${approval.tool}` });
            },
            onToolStart: (event) => {
                // Accumulate for Claude CLI rich view
                if (isClaudeCliResponse) {
                    claudeToolEvents.push({
                        type: 'tool_start',
                        tools: [{ name: event.tool, input: event.input }],
                    });
                }
                const toolLabel = event.tool.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
                const inputPreview = event.input?.command
                    ? `: \`${String(event.input.command).slice(0, 60)}\``
                    : event.input?.path
                        ? `: ${String(event.input.path).slice(0, 60)}`
                        : event.input?.query
                            ? `: ${String(event.input.query).slice(0, 60)}`
                            : '';
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: `[tool_exec] \u{1F527} Running ${toolLabel}${inputPreview}...`,
                    timestamp: Date.now(),
                    meta: {
                        system: 'true',
                        type: 'tool_exec',
                        event: 'tool_start',
                        tool: event.tool,
                        status: 'running',
                        iteration: String(event.iteration),
                        inputJson: event.input ? JSON.stringify(event.input).slice(0, 200) : '',
                    },
                });
                actions.setStatusLine(`Running ${toolLabel}...`);
                setStreamPhase('tool_use');
                setActiveToolName(event.tool);
            },
            onToolError: (event) => {
                const toolLabel = event.tool.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: `[tool_exec] \u274C ${toolLabel} failed: ${event.error.slice(0, 120)}`,
                    timestamp: Date.now(),
                    meta: {
                        system: 'true',
                        type: 'tool_exec',
                        event: 'tool_error',
                        tool: event.tool,
                        status: 'error',
                        iteration: String(event.iteration),
                        error: event.error.slice(0, 300),
                    },
                });
                actions.addFeed(sessionId, 'tool_result', `${toolLabel}: error`, {
                    tool: event.tool,
                    status: 'error',
                });
                actions.addActivity(sessionId, 'error', `\u2717 ${toolLabel} failed`);
            },
            onToolResult: (result) => {
                // Accumulate for Claude CLI rich view
                if (isClaudeCliResponse) {
                    claudeToolEvents.push({
                        type: 'tool_result',
                        tool: result.tool,
                        result: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
                        isError: result.status === 'error',
                    });
                }
                const toolLabel = result.tool.replace(/^(mib_|aros_)/, '').replace(/_/g, ' ');
                const statusIcon = result.status === 'success' ? '\u2713' : '\u2717';
                const durationStr = result.duration_ms
                    ? ` (${(result.duration_ms / 1000).toFixed(1)}s)`
                    : '';
                if (processStepRef.current)
                    updateStep(runId, processStepRef.current, {
                        status: 'completed',
                        completedAt: Date.now(),
                    });
                const stepId = addStep(runId, {
                    kind: 'tool_result',
                    label: `${statusIcon} ${toolLabel}${durationStr}`,
                    toolName: result.tool,
                    detail: result.status === 'error' ? String(result.output || 'Error') : undefined,
                });
                processStepRef.current = stepId;
                // Add inline tool completion message
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: `[tool_exec] ${result.status === 'success' ? '\u2705' : '\u274C'} ${toolLabel} ${result.status === 'success' ? 'completed' : 'failed'}${durationStr}`,
                    timestamp: Date.now(),
                    meta: {
                        system: 'true',
                        type: 'tool_exec',
                        event: 'tool_result',
                        tool: result.tool,
                        status: result.status,
                        duration: result.duration_ms ? String(result.duration_ms) : '',
                        outputPreview: result.status === 'success' && typeof result.output === 'string'
                            ? result.output.slice(0, 200)
                            : '',
                    },
                });
                actions.addFeed(sessionId, 'tool_result', `${toolLabel}: ${result.status}${durationStr}`, { tool: result.tool, status: result.status });
                actions.addActivity(sessionId, 'executing', `${statusIcon} ${toolLabel}${durationStr}`);
            },
            onModelFailed: (model, reason) => {
                const shortModel = model.includes('/') ? model.split('/').pop() : model;
                const failLine = `~~${shortModel}: Failed~~ \u2014 ${reason}\n\n`;
                fullResponse = failLine;
                actions.setStreamText(failLine);
                actions.addActivity(sessionId, 'error', `${shortModel} failed: ${reason}`);
                actions.addFeed(sessionId, 'error', `${shortModel}: ${reason}`);
                if (processStepRef.current)
                    updateStep(runId, processStepRef.current, {
                        status: 'completed',
                        completedAt: Date.now(),
                    });
                addStep(runId, { kind: 'error', label: `${shortModel}: Failed` });
            },
            onClearResponse: () => {
                const failLine = fullResponse.match(/^~~.+?~~.*?\n\n/)?.[0] || '';
                fullResponse = failLine;
                actions.setStreamText(failLine);
                streamStarted = false;
            },
            onModelSwitch: (from, to, _reason) => {
                const shortTo = to.includes('/') ? to.split('/').pop() : to;
                actions.setStatusLine(`Retrying with ${shortTo}...`);
                setStreamPhase('thinking');
                const stepId = addStep(runId, { kind: 'thinking', label: `Retrying \u2192 ${shortTo}` });
                processStepRef.current = stepId;
            },
            // ── Claude CLI callbacks ──
            onClaudeCliRoute: (_mode) => {
                isClaudeCliResponse = true;
                claudeToolEvents = [];
                actions.addMessage(sessionId, {
                    role: 'assistant',
                    content: '[system] Routing to Claude Code CLI for execution',
                    timestamp: Date.now(),
                    meta: { system: 'true', type: 'system', event: 'route-change' },
                });
                setStreamPhase('tool_use');
                setActiveToolName('Claude CLI');
                actions.setStatusLine('Claude Code CLI executing...');
            },
            onClaudeSessionStart: (sid) => {
                claudeSessionId = sid;
                claudeToolEvents.push({ type: 'session_start', sessionId: sid });
                actions.setStatusLine('Claude CLI session started...');
            },
            onClaudeSessionEnd: (data) => {
                if (data.costUsd != null)
                    claudeCost = data.costUsd;
                if (data.durationMs != null)
                    claudeDuration = data.durationMs;
                claudeToolEvents.push({ type: 'session_end', ...data });
            },
            onClaudeResult: (data) => {
                if (data.costUsd != null)
                    claudeCost = data.costUsd;
                if (data.durationMs != null)
                    claudeDuration = data.durationMs;
                if (data.model)
                    claudeModel = data.model;
                claudeToolEvents.push({ type: 'claude_result', ...data });
            },
            onFileDiff: (data) => {
                claudeToolEvents.push({ type: 'file_diff', ...data });
            },
            onClaudeSystem: (message) => {
                claudeToolEvents.push({ type: 'status', text: message });
            },
        }, controller.signal, sessionId, selectedModel || undefined, attachments.length > 0 ? attachments : undefined, routerMode, session?.parentId || replyToIndex !== null
            ? {
                ...(session?.parentId
                    ? { parentSessionId: session.parentId, branchPoint: session.messages.length }
                    : {}),
                ...(replyToIndex !== null ? { replyToMessageIndex: replyToIndex } : {}),
            }
            : undefined, contextHealth, claudeCliMode, directMode, voiceMode);
    }, [
        input,
        streaming,
        syncing,
        ensureSession,
        sessions,
        activeSessionId,
        actions,
        pendingFiles,
        wsConnected,
        wsReconnecting,
        activeAgentId,
        currentAgent.name,
        cliMode,
        routerMode,
        directMode,
        claudeCliMode,
        voiceMode,
        sendViaCLI,
        selectedModel,
        compareMode,
        compareModels,
        startRun,
        addStep,
        updateStep,
        completeRun,
        executeSlashCommand,
        generateSuggestions,
        identityVerified,
        pendingMessage,
        verifyIdentity,
    ]);
    const handleSendRef = useRef(handleSend);
    handleSendRef.current = handleSend;
    useEffect(() => {
        if (pendingEditSendRef.current && input.trim()) {
            pendingEditSendRef.current = false;
            handleSend();
        }
        if (pendingSuggestionSendRef.current && input.trim()) {
            pendingSuggestionSendRef.current = false;
            handleSend();
        }
    }, [input, handleSend]);
    useEffect(() => {
        if (wasStreamingRef.current && !streaming && queue.length > 0) {
            const [next, ...rest] = queue;
            setQueue(rest);
            setTimeout(() => {
                setInput(next.text);
                setTimeout(() => {
                    sendQueuedRef.current = true;
                }, 50);
            }, 500);
        }
        wasStreamingRef.current = streaming;
    }, [streaming, queue]);
    useEffect(() => {
        if (sendQueuedRef.current && !streaming && input.trim()) {
            sendQueuedRef.current = false;
            const btn = document.querySelector('[data-send-btn]');
            btn?.click();
        }
    });
    return {
        handleSend,
        handleSendRef,
        sendViaCLI,
        verifyIdentity,
        generateSuggestions,
        sendFeedbackToRapidRMS,
        queue,
        setQueue,
        editingQueueId,
        setEditingQueueId,
        editingQueueText,
        setEditingQueueText,
        cliContinue,
        setCliContinue,
        pendingSuggestionSendRef,
    };
}
