// @ts-check
// Voice context pipeline — chunk, score, assemble focused context for voice-assist
// Pure utility module: no HTTP, no side effects, all functions are input → output

/** @typedef {{ text: string, role: string, msgIndex: number, charCount: number }} SentenceChunk */
/** @typedef {SentenceChunk & { score: number }} ScoredChunk */
/** @typedef {{ relevant: boolean, context: string, chunkCount?: number, totalChars?: number }} AssembledContext */

/** @typedef {{ stores: string[], comparison: boolean, metric: string, period: string }} StoreReferences */

/**
 * Detect store name references, comparison intent, metric, and period in voice input.
 * @param {string} text
 * @returns {StoreReferences}
 */
export function detectStoreReferences(text) {
  const lower = (text || "").toLowerCase();

  // ── Detect store names ──
  /** @type {string[]} */
  const stores = [];

  // "all stores" / "every store" / "each store" / "every location"
  if (/\b(?:all|every|each)\s+(?:stores?|locations?|branches?)\b/i.test(lower)) {
    stores.push("all stores");
  }

  // Quoted store names: "Party Liquor", 'Main Street'
  const quotedRe = /["']([^"']{2,40})["']/g;
  let qm;
  while ((qm = quotedRe.exec(text)) !== null) {
    stores.push(qm[1].trim());
  }

  // Common multi-word store name patterns (capitalized words before "store"/"location")
  const namedRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:store|location|branch)\b/g;
  let nm;
  while ((nm = namedRe.exec(text)) !== null) {
    const name = nm[1].trim();
    if (!stores.includes(name)) stores.push(name);
  }

  // "store on [Street Name]" / "the [Name] store"
  const streetRe = /\b(?:store\s+on|the)\s+([A-Z][a-z]+(?:\s+(?:Street|Ave|Blvd|Road|Rd|Dr|Lane|Ln|Way|Pkwy|Court|Ct|Plaza|Sq))?)\s*(?:store|location)?\b/g;
  let sm;
  while ((sm = streetRe.exec(text)) !== null) {
    const name = sm[1].trim();
    if (name.length > 2 && !stores.includes(name) && !/^(The|Store|My|Our|This|That)$/i.test(name)) {
      stores.push(name);
    }
  }

  // ── Comparison detection ──
  const comparison = stores.length > 1
    || /\b(?:compar|versus|vs\.?|against|between|difference)\b/i.test(lower)
    || stores.includes("all stores");

  // ── Metric detection ──
  let metric = "";
  const metricPatterns = [
    { re: /\b(?:sales|sold)\b/i, metric: "sales" },
    { re: /\brevenue\b/i, metric: "revenue" },
    { re: /\borders?\b/i, metric: "orders" },
    { re: /\binventory\b/i, metric: "inventory" },
    { re: /\bcustomers?\b/i, metric: "customers" },
    { re: /\bprofit(?:s|ability)?\b/i, metric: "profit" },
  ];
  for (const mp of metricPatterns) {
    if (mp.re.test(lower)) { metric = mp.metric; break; }
  }

  // ── Period detection ──
  let period = "";
  const periodPatterns = [
    { re: /\btoday\b/i, period: "today" },
    { re: /\byesterday\b/i, period: "yesterday" },
    { re: /\bthis\s+week\b/i, period: "this week" },
    { re: /\blast\s+week\b/i, period: "last week" },
    { re: /\bthis\s+month\b/i, period: "this month" },
    { re: /\blast\s+month\b/i, period: "last month" },
  ];
  for (const pp of periodPatterns) {
    if (pp.re.test(lower)) { period = pp.period; break; }
  }

  return { stores, comparison, metric, period };
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "my", "me", "for", "to", "of",
  "and", "or", "in", "at", "on", "it", "was", "what", "how", "can",
  "do", "you", "i", "this", "that", "with", "from",
]);

const ABBREVIATIONS = /(?:e\.g|i\.e|Dr|Mr|Mrs|Ms|vs|etc|Jr|Sr|St|Ltd|Inc|Corp|approx|dept|est|govt|avg|min|max|no|vol)\./gi;

/**
 * Split chat messages into sentence-level chunks.
 * Preserves numbers, abbreviations, table rows, and long data blocks.
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {SentenceChunk[]}
 */
export function chunkIntoSentences(messages) {
  if (!messages || !messages.length) return [];

  /** @type {SentenceChunk[]} */
  const chunks = [];

  for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
    const msg = messages[msgIndex];
    const content = typeof msg.content === "string" ? msg.content : String(msg.content || "");
    if (!content.trim()) continue;

    const role = msg.role || "user";
    const lines = content.split("\n");

    // Group table rows together, process normal text separately
    let textBuffer = "";

    for (const line of lines) {
      const trimmed = line.trim();

      // Table row: starts with | or contains tab-separated data columns
      if (trimmed.startsWith("|") || (trimmed.includes("\t") && trimmed.split("\t").length >= 2)) {
        // Flush any pending text buffer first
        if (textBuffer.trim()) {
          for (const s of splitTextIntoSentences(textBuffer)) {
            chunks.push({ text: s.trim(), role, msgIndex, charCount: s.trim().length });
          }
          textBuffer = "";
        }
        // Add table row as single chunk
        if (trimmed) {
          chunks.push({ text: trimmed, role, msgIndex, charCount: trimmed.length });
        }
      } else {
        textBuffer += (textBuffer ? "\n" : "") + line;
      }
    }

    // Flush remaining text buffer
    if (textBuffer.trim()) {
      for (const s of splitTextIntoSentences(textBuffer)) {
        if (s.trim()) {
          chunks.push({ text: s.trim(), role, msgIndex, charCount: s.trim().length });
        }
      }
    }
  }

  return chunks;
}

/**
 * Split text into sentences, protecting numbers, abbreviations, and long blocks.
 * @param {string} text
 * @returns {string[]}
 */
function splitTextIntoSentences(text) {
  if (!text.trim()) return [];

  // If the whole block is >500 chars with no clear sentence boundaries, keep it whole
  if (text.length > 500 && !hasSentenceBoundary(text)) {
    return [text];
  }

  // Replace abbreviations with placeholders to protect them from splitting
  /** @type {string[]} */
  const abbrStore = [];
  let protected_ = text.replace(ABBREVIATIONS, (match) => {
    abbrStore.push(match);
    return `\x00ABBR${abbrStore.length - 1}\x00`;
  });

  // Protect numbers with decimals: $1,234.56, 56.7%, 12.5, 0.99
  /** @type {string[]} */
  const numStore = [];
  protected_ = protected_.replace(/\$?[\d,]+\.[\d]+%?/g, (match) => {
    numStore.push(match);
    return `\x00NUM${numStore.length - 1}\x00`;
  });

  // Split at sentence boundaries: .!?\n (but not inside protected tokens)
  const sentences = protected_.split(/(?<=[.!?])\s+|(?<=\n)\s*/);

  // Restore protected tokens
  return sentences
    .map((s) => {
      let restored = s;
      restored = restored.replace(/\x00ABBR(\d+)\x00/g, (_, idx) => abbrStore[parseInt(idx)] || "");
      restored = restored.replace(/\x00NUM(\d+)\x00/g, (_, idx) => numStore[parseInt(idx)] || "");
      return restored;
    })
    .filter((s) => s.trim().length > 0);
}

/**
 * Check if text has clear sentence-ending punctuation followed by more text.
 * @param {string} text
 * @returns {boolean}
 */
function hasSentenceBoundary(text) {
  // Protect numbers/abbreviations first
  let clean = text.replace(/\$?[\d,]+\.[\d]+%?/g, "X");
  clean = clean.replace(ABBREVIATIONS, "X");
  return /[.!?]\s+[A-Z]/.test(clean) || /\n/.test(text);
}

/**
 * Score sentence chunks by relevance to the voice query.
 * @param {SentenceChunk[]} chunks
 * @param {string} query
 * @returns {ScoredChunk[]}
 */
export function scoreRelevance(chunks, query) {
  if (!chunks || !chunks.length) return [];

  const queryLower = (query || "").toLowerCase();
  const keywords = queryLower
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  const totalMessages = Math.max(1, ...chunks.map((c) => c.msgIndex + 1));
  const hasNumbers = /[$\d][\d,]*\.?\d*%?/;

  return chunks.map((chunk) => {
    let score = 0;
    const chunkLower = chunk.text.toLowerCase();

    // Keyword matching
    for (const kw of keywords) {
      // Exact match
      if (chunkLower.includes(kw)) {
        score += 3;
      } else {
        // Partial/stem match — check if keyword stem (3+ chars) appears in chunk
        const stem = kw.length >= 4 ? kw.slice(0, -1) : kw;
        if (stem.length >= 3 && chunkLower.includes(stem)) {
          score += 1;
        }
      }
    }

    // Assistant bonus
    if (chunk.role === "assistant") {
      score += 2;
    }

    // Recency bonus
    score += (chunk.msgIndex + 1) / totalMessages;

    // Numeric/currency bonus
    if (hasNumbers.test(chunk.text)) {
      score += 2;
    }

    return { ...chunk, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Assemble focused context from top-scoring chunks.
 * @param {ScoredChunk[]} scoredChunks
 * @param {number} [maxChars=3000]
 * @returns {AssembledContext}
 */
export function assembleContext(scoredChunks, maxChars = 3000) {
  if (!scoredChunks || !scoredChunks.length) {
    return { relevant: false, context: "" };
  }

  // Check if any chunk scores above threshold
  const hasRelevant = scoredChunks.some((c) => c.score > 2);
  if (!hasRelevant) {
    return { relevant: false, context: "" };
  }

  // Take top chunks within char budget
  /** @type {ScoredChunk[]} */
  const selected = [];
  let totalChars = 0;

  for (const chunk of scoredChunks) {
    if (totalChars + chunk.charCount > maxChars) {
      // If we can still fit a smaller chunk, check remaining
      if (totalChars + chunk.charCount > maxChars + 100) continue;
    }
    if (totalChars >= maxChars) break;
    selected.push(chunk);
    totalChars += chunk.charCount;
  }

  if (selected.length === 0) {
    return { relevant: false, context: "" };
  }

  // Re-sort by original message order
  selected.sort((a, b) => a.msgIndex - b.msgIndex || 0);

  // Build context with gap markers
  const parts = [];
  let lastMsgIndex = -1;

  for (const chunk of selected) {
    if (lastMsgIndex >= 0 && chunk.msgIndex > lastMsgIndex + 1) {
      parts.push("[...]");
    }
    parts.push(`${chunk.role}: ${chunk.text}`);
    lastMsgIndex = chunk.msgIndex;
  }

  return {
    relevant: true,
    context: parts.join("\n"),
    chunkCount: selected.length,
    totalChars,
  };
}
