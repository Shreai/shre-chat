# Graph Report - shre-chat  (2026-05-27)

## Corpus Check
- 280 files · ~493,027 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2427 nodes · 4769 edges · 53 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 346 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 85|Community 85]]

## God Nodes (most connected - your core abstractions)
1. `mt()` - 90 edges
2. `rv()` - 73 edges
3. `requestHandler()` - 43 edges
4. `bA` - 40 edges
5. `wA` - 36 edges
6. `r()` - 35 edges
7. `gx()` - 34 edges
8. `B()` - 33 edges
9. `st()` - 32 edges
10. `$t()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `upsertSession()` --calls--> `registerSessionRoutes()`  [INFERRED]
  serve.js → routes/sessions.js
- `dbSessionToClient()` --calls--> `registerSessionRoutes()`  [INFERRED]
  serve.js → routes/sessions.js
- `authCookie()` --calls--> `registerAuthRoutes()`  [INFERRED]
  serve.js → routes/auth.js
- `json()` --calls--> `registerHealthRoutes()`  [INFERRED]
  serve.js → routes/health.js
- `requestHandler()` --calls--> `To()`  [INFERRED]
  serve.js → e2e/results/html-report/trace/sw.bundle.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (250): af(), ef(), ff(), Ja(), lf(), mt(), nf(), of() (+242 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (142): test(), t(), _a, aa, Ai(), as(), at(), be() (+134 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (17): bA, Bh(), Cb(), Dh(), el(), gE(), Gy(), Lo (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (52): ax(), b2(), Bi(), br(), Cr, cT(), Da(), ds() (+44 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (73): useAppList(), useChatEffects(), useChatKeydown(), useChatSearch(), useEscalationListener(), useFileHandling(), useFilteredMessages(), useGatewayConnection() (+65 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (93): auditLog(), cachePlatformId(), checkAuth(), getVaultKey(), hashPassword(), isDeviceTrusted(), issueAuthToken(), loadTrustedDevices() (+85 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (31): cs(), DE(), Di(), f0, hh(), Ia(), Jh, Jv() (+23 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (20): _t(), be(), ce, ct(), de, _e(), Ee(), fe() (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (11): _2, E2, fr, handler(), getProviderGroup(), groupModels(), handler(), handleKey() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (37): abortAllStreams(), abortChatWS(), loadHistoryWS(), sendChatWS(), setModelWS(), connectGateway(), disconnectGateway(), ensureConnected() (+29 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (34): load(), appendCliResponse(), appendUserMessage(), buildSessionContext(), closeSession(), collectBodyStr(), createSession(), generateSummary() (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (10): a_, Ah, gc(), k0(), l_, mc(), qt, r() (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (12): messageToStep(), stepFromSystemEvent(), stepFromToolExec(), fetchContextSources(), buildDefaultSystemPrompt(), handleCopy(), handleCopy(), classifySystemEvent() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (10): dc(), Fb(), id(), Io(), jS(), Kb(), Li(), ur() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.26
Nodes (3): NS, sd(), Wn()

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (12): handleReply(), syncFeed(), fetchFeed(), fetchWithRetry(), getTenantId(), getUserLanguage(), _readSSEStream(), reportUsage() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (4): Bo(), oc, tS(), Ui

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (16): cap(), extractLabel(), fmtVal(), onKey(), parse(), toggle(), downloadBlob(), exportProseToPDF() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (7): createMockReq(), createMockRes(), createRateLimitHelper(), getJsonResponse(), verifyIdentity(), createTask(), voiceCommand()

### Community 19 - "Community 19"
Cohesion: 0.39
Nodes (15): extractContent(), fetchJson(), main(), record(), testAuthCheck(), testAuthLogin(), testChatNonStreaming(), testChatStreaming() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (4): eE, j_(), Oh(), W_

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (4): applyTheme(), createThemeFromBranding(), setBrandAssets(), bootstrapBranding()

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (7): fetchTranslations(), flatten(), getLocale(), initI18n(), resolveBrowserLocale(), setLocale(), useI18n()

### Community 24 - "Community 24"
Cohesion: 0.2
Nodes (4): cleanup(), connectWs(), handleSubmit(), handleVisibility()

### Community 25 - "Community 25"
Cohesion: 0.26
Nodes (7): deleteEntry(), deriveTitle(), detectType(), loadLibrary(), queuePreview(), saveLibrary(), selectEntry()

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (5): attemptRefresh(), currentToken(), installAuthFetch(), isReplayableBody(), parseJwtExp()

### Community 27 - "Community 27"
Cohesion: 0.2
Nodes (2): describeArc(), polarToCartesian()

### Community 28 - "Community 28"
Cohesion: 0.38
Nodes (9): collectBodyStr(), escalateToCli(), extractPlan(), extractSection(), extractStructuredPlan(), extractTeaching(), handoffToAgents(), recordTeaching() (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (6): getSnapshotFor(), notify(), setPlan(), updatePlanStatus(), updateTaskStatus(), usePlan()

### Community 30 - "Community 30"
Cohesion: 0.39
Nodes (7): createBugTasks(), ensureFixtures(), generateReport(), main(), parseResults(), printSummary(), runTests()

### Community 32 - "Community 32"
Cohesion: 0.42
Nodes (6): isAndroid(), isAPISupported(), isIOS(), isMobile(), queryPermission(), useDevicePermissions()

### Community 33 - "Community 33"
Cohesion: 0.32
Nodes (3): fetchPeriodData(), formatDate(), generateMockMetrics()

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (2): tierBg(), tierColor()

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (4): useProactiveNotifications(), useVoiceAssistantLogic(), useVAD(), createSpeak()

### Community 38 - "Community 38"
Cohesion: 0.29
Nodes (1): MockWebSocketBase

### Community 43 - "Community 43"
Cohesion: 0.53
Nodes (4): matchesContinue(), matchesRecall(), matchesStatus(), stripFiller()

### Community 44 - "Community 44"
Cohesion: 0.4
Nodes (2): extractAuth(), verifyTestToken()

### Community 47 - "Community 47"
Cohesion: 0.4
Nodes (1): A0

### Community 48 - "Community 48"
Cohesion: 0.5
Nodes (2): classifySegment(), splitIntents()

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (2): handleSuggestionClick(), switchConversation()

### Community 53 - "Community 53"
Cohesion: 0.5
Nodes (2): apiFetch(), getToken()

### Community 55 - "Community 55"
Cohesion: 0.5
Nodes (2): fetchApi(), load()

### Community 56 - "Community 56"
Cohesion: 0.4
Nodes (1): ViewErrorBoundary

### Community 57 - "Community 57"
Cohesion: 0.4
Nodes (1): ErrorBoundary

### Community 58 - "Community 58"
Cohesion: 0.5
Nodes (2): isBrowserApproval(), isStatusMessage()

### Community 61 - "Community 61"
Cohesion: 0.5
Nodes (2): RealtimeVoiceOverlay(), useRealtimeVoice()

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (2): detectArtifactType(), extractArtifacts()

### Community 63 - "Community 63"
Cohesion: 0.83
Nodes (3): downloadBlob(), exportCSV(), exportJSON()

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (2): registerAndConnect(), startOAuthFlow()

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (2): getChatWidgets(), getEnabledWidgets()

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (2): loadOrGenerateVapidKeys(), registerPushRoutes()

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (2): getToken(), handleDelete()

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (2): extractCitations(), extractDomain()

## Knowledge Gaps
- **1 isolated node(s):** `g2`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 27`** (11 nodes): `describeArc()`, `dsColor()`, `formatValue()`, `isDarkTheme()`, `niceScale()`, `polarToCartesian()`, `smoothPath()`, `toX()`, `toY()`, `useThemeColors()`, `ChartRenderer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (8 nodes): `fetchJson()`, `iconEmoji()`, `load()`, `openDetail()`, `priceLabel()`, `tierBg()`, `tierColor()`, `MarketplaceView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (7 nodes): `gateway-ws-setup.ts`, `MockWebSocketBase`, `.addEventListener()`, `.close()`, `.dispatchEvent()`, `.removeEventListener()`, `.send()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (6 nodes): `serve-auth.test.ts`, `extractAuth()`, `isPublicPath()`, `issueExpiredToken()`, `issueTestToken()`, `verifyTestToken()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (5 nodes): `A0`, `.constructor()`, `.toJSON()`, `.toSource()`, `.toString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (5 nodes): `buildAgentMessage()`, `classifySegment()`, `hasIntentSignal()`, `splitIntents()`, `intentSplitter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (5 nodes): `flushTable()`, `handleDemoSend()`, `handleSuggestionClick()`, `switchConversation()`, `DemoView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (5 nodes): `apiFetch()`, `getToken()`, `relativeTime()`, `toggleProject()`, `ProjectsView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (5 nodes): `fetchApi()`, `fmtDuration()`, `load()`, `triggerRun()`, `FinetuneView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (5 nodes): `ViewErrorBoundary.tsx`, `ViewErrorBoundary`, `.componentDidCatch()`, `.getDerivedStateFromError()`, `.render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (5 nodes): `ErrorBoundary`, `.componentDidCatch()`, `.getDerivedStateFromError()`, `.render()`, `ErrorBoundary.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (5 nodes): `getAssistantVersionInfo()`, `isBrowserApproval()`, `isStatusMessage()`, `toToolExecStep()`, `MessageList.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (4 nodes): `RealtimeVoiceOverlay()`, `useRealtimeVoice()`, `RealtimeVoiceOverlay.tsx`, `useRealtimeVoice.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (4 nodes): `detectArtifactType()`, `extractArtifacts()`, `handler()`, `ArtifactCanvas.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (4 nodes): `registerAndConnect()`, `startOAuthFlow()`, `storeApiKey()`, `OAuthSetup.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (4 nodes): `registry.ts`, `getChatWidgets()`, `getEnabledWidgets()`, `registerChatWidget()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (3 nodes): `push.js`, `loadOrGenerateVapidKeys()`, `registerPushRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (3 nodes): `getToken()`, `handleDelete()`, `RemindersList.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (3 nodes): `extractCitations()`, `extractDomain()`, `CitationLinks.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requestHandler()` connect `Community 5` to `Community 0`, `Community 1`, `Community 10`, `Community 6`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `mt()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 6`, `Community 8`, `Community 11`, `Community 13`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `gx()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 6`, `Community 7`, `Community 11`, `Community 16`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Are the 73 inferred relationships involving `mt()` (e.g. with `PE()` and `xE()`) actually correct?**
  _`mt()` has 73 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `requestHandler()` (e.g. with `To()` and `.resolve()`) actually correct?**
  _`requestHandler()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `g2` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._