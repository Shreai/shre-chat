# Shre Chat — Troubleshooting

## Common Issues

### "Internal server error" on login

**Cause:** shre-auth is not running or unreachable.

**Fix:**
```bash
# Check shre-auth health
curl http://127.0.0.1:5455/health

# If down, start it
cd ../shre-auth && npm run serve &
```

### "Too many login attempts"

**Cause:** Login rate limit hit (5 external / 30 localhost attempts per 15 min).

**Fix:** Restart shre-chat to clear in-memory rate limits:
```bash
kill $(lsof -iTCP:5510 -sTCP:LISTEN -t) && npm run serve &
```

### "Request timed out" in chat

**Cause:** The router-backed path or local direct path is slow or down. AI providers may be unreachable.

**Fix:**
```bash
# Check router health
curl http://127.0.0.1:5497/health

# Check Ollama (local models)
curl http://127.0.0.1:11434/api/tags
```

### Chat shows "Disconnected" status

**Cause:** WebSocket `/ws/notifications` can't connect. Usually harmless — chat still works via HTTP.

**Fix:** Check that shre-chat is running and refresh the page.

### Server crashes during QA tests

**Cause:** Uncaught exception from proxy race conditions under heavy load.

**Fix:** The server now suppresses non-fatal network errors (`ECONNRESET`, `EPIPE`, `ETIMEDOUT`). If crashes persist, check logs:
```bash
tail -50 /tmp/shre-chat-debug.log
# or
tail -50 ~/Library/Logs/shre-services/shre-chat.log
```

### QA tests all skip (0% pass rate)

**Cause:** Auth setup failed — usually rate limiting or shre-auth down.

**Fix:**
```bash
# Clear stale auth + restart server to reset rate limits
rm -f /tmp/shre-chat-auth.json
kill $(lsof -iTCP:5510 -sTCP:LISTEN -t) && npm run serve &
# Wait 2s, then run tests
npm run qa
```

### Port 5510 already in use

**Fix:**
```bash
# Find and kill the process
lsof -iTCP:5510 -sTCP:LISTEN
kill <PID>
```

### CortexDB tests skip

**Cause:** CortexDB runs in Docker, Docker Desktop not running.

**Fix:** Start Docker Desktop, then:
```bash
docker compose up -d cortexdb
```

### HTTPS / SSL errors in tests

**Cause:** Tests using `https://` URLs for services that run HTTP.

**Fix:** All local services run HTTP. Check test files for `https://127.0.0.1:` and change to `http://`.

### Theme toggle / system prompt tests skip

**Cause:** Test selectors stale — buttons moved to different location in UI.

**Fix:** Theme toggle uses `aria-label="Switch to light/dark mode"`. System prompt is in the "More options" menu (not a standalone button).

### "No conversations yet" in sidebar

**Normal behavior** on first login. Sessions appear after sending the first message.

### Voice recording not working

**Causes:**
- Browser microphone permission not granted
- HTTPS required for `navigator.mediaDevices` on non-localhost
- `micEnabled` intentionally resets to `false` on page load (security)

**Fix:** Grant microphone permission in browser settings. Use `localhost` (not IP) for development.

## Diagnostics

### Health check
```bash
curl http://127.0.0.1:5510/health | python3 -m json.tool
```

### Service dependency check
```bash
for port in 5497 5455 5460 5498 11434; do
  echo -n "Port $port: "
  curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:$port/health
  echo
done
```

### View active connections
```bash
lsof -iTCP:5510 | head -20
```

### Check server logs
```bash
# If running via LaunchAgent
tail -f ~/Library/Logs/shre-services/shre-chat.log

# If running manually with debug logging
node serve.js 2>&1 | tee /tmp/shre-chat-debug.log
```

### Run single test with debug output
```bash
npx playwright test --project=smoke --reporter=list --debug
```

## Architecture Gotchas

1. **HTTP not HTTPS** — All local services run HTTP. Some old code references HTTPS URLs, causing SSL errors.
2. **Rate limits are in-memory** — They reset on server restart. No persistence.
3. **Auth cookie is httpOnly** — Can't read `shre_token` from JavaScript. Check via `/api/auth/check`.
4. **Ctrl+Enter to send** — Plain Enter inserts newlines. This is intentional (multiline support).
5. **macOS TCC** — LaunchAgents can't exec from `~/Documents/`. Scripts must be in `~/.local/bin/`.
6. **NAS symlink** — `~/.shre/` may be a NAS symlink. Never use it in LaunchAgent log paths.
