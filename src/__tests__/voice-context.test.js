import { describe, it, expect } from 'vitest';
// @ts-ignore — JS module with JSDoc types
import { chunkIntoSentences, scoreRelevance, assembleContext } from '../../routes/voice-context.js';
// ── chunkIntoSentences ──────────────────────────────────────────────────────
describe('chunkIntoSentences', () => {
    it('splits basic sentences', () => {
        const chunks = chunkIntoSentences([{ role: 'user', content: 'Hello. World.' }]);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toBe('Hello.');
        expect(chunks[1].text).toBe('World.');
    });
    it('preserves numbers with decimals', () => {
        const chunks = chunkIntoSentences([
            { role: 'assistant', content: "Sales were $1,234.56. That's good." },
        ]);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toContain('$1,234.56');
        expect(chunks[1].text).toBe("That's good.");
    });
    it('preserves table rows as single chunks', () => {
        const chunks = chunkIntoSentences([
            { role: 'assistant', content: '| Item | Price |\n| Apples | $3.99 |\n| Bananas | $1.50 |' },
        ]);
        expect(chunks).toHaveLength(3);
        expect(chunks[0].text).toBe('| Item | Price |');
        expect(chunks[1].text).toBe('| Apples | $3.99 |');
    });
    it('handles messages with no periods — single chunk', () => {
        const chunks = chunkIntoSentences([{ role: 'user', content: 'Tell me about sales' }]);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe('Tell me about sales');
    });
    it('returns empty array for empty messages', () => {
        expect(chunkIntoSentences([])).toEqual([]);
        expect(chunkIntoSentences(null)).toEqual([]);
        expect(chunkIntoSentences(undefined)).toEqual([]);
    });
    it('returns empty array for messages with empty content', () => {
        const chunks = chunkIntoSentences([{ role: 'user', content: '' }]);
        expect(chunks).toEqual([]);
    });
    it('keeps very long single sentence (>500 chars) as one chunk', () => {
        const longText = 'A'.repeat(600);
        const chunks = chunkIntoSentences([{ role: 'assistant', content: longText }]);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].charCount).toBe(600);
    });
    it('preserves abbreviations like e.g. and i.e.', () => {
        const chunks = chunkIntoSentences([
            { role: 'assistant', content: 'Use tools e.g. Vite. It works well.' },
        ]);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toContain('e.g.');
    });
    it('sets correct msgIndex and role', () => {
        const chunks = chunkIntoSentences([
            { role: 'user', content: 'Question here.' },
            { role: 'assistant', content: 'Answer here.' },
        ]);
        expect(chunks[0].msgIndex).toBe(0);
        expect(chunks[0].role).toBe('user');
        expect(chunks[1].msgIndex).toBe(1);
        expect(chunks[1].role).toBe('assistant');
    });
    it('handles tab-separated data as table rows', () => {
        const chunks = chunkIntoSentences([
            { role: 'assistant', content: 'Product\tRevenue\tMargin\nWidgets\t$5000\t25%' },
        ]);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toContain('Product');
        expect(chunks[1].text).toContain('Widgets');
    });
});
// ── scoreRelevance ──────────────────────────────────────────────────────────
describe('scoreRelevance', () => {
    it('scores keyword matches higher', () => {
        const chunks = chunkIntoSentences([
            { role: 'assistant', content: 'Total sales: $5,000. The weather is nice.' },
        ]);
        const scored = scoreRelevance(chunks, 'sales today');
        // "Total sales: $5,000" should score higher than "The weather is nice"
        expect(scored[0].text).toContain('sales');
    });
    it('gives assistant messages a bonus', () => {
        const chunks = [
            { text: 'Sales data here', role: 'user', msgIndex: 0, charCount: 15 },
            { text: 'Sales data here', role: 'assistant', msgIndex: 1, charCount: 15 },
        ];
        const scored = scoreRelevance(chunks, 'sales');
        // Assistant chunk should score higher (same text but +2 bonus)
        const assistantChunk = scored.find((c) => c.role === 'assistant');
        const userChunk = scored.find((c) => c.role === 'user');
        expect(assistantChunk.score).toBeGreaterThan(userChunk.score);
    });
    it('gives bonus for numbers and currency', () => {
        const chunks = [
            { text: 'Revenue was $12,000', role: 'assistant', msgIndex: 0, charCount: 19 },
            { text: 'Revenue was great', role: 'assistant', msgIndex: 0, charCount: 17 },
        ];
        const scored = scoreRelevance(chunks, 'revenue');
        expect(scored[0].text).toContain('$12,000');
    });
    it('gives recency bonus — later messages score higher', () => {
        const chunks = [
            { text: 'Old sales data', role: 'assistant', msgIndex: 0, charCount: 14 },
            { text: 'New sales data', role: 'assistant', msgIndex: 9, charCount: 14 },
        ];
        const scored = scoreRelevance(chunks, 'sales');
        // Same keywords but msgIndex 9 should have higher recency
        expect(scored[0].text).toBe('New sales data');
    });
    it('returns empty array for empty input', () => {
        expect(scoreRelevance([], 'query')).toEqual([]);
        expect(scoreRelevance(null, 'query')).toEqual([]);
    });
    it('handles empty query — returns chunks with base scores', () => {
        const chunks = [{ text: 'Some data', role: 'assistant', msgIndex: 0, charCount: 9 }];
        const scored = scoreRelevance(chunks, '');
        expect(scored).toHaveLength(1);
        // Should still have assistant bonus + recency
        expect(scored[0].score).toBeGreaterThan(0);
    });
    it('handles partial/stem matching', () => {
        const chunks = [
            { text: 'The selling price was high', role: 'assistant', msgIndex: 0, charCount: 25 },
            { text: 'Nothing relevant here', role: 'assistant', msgIndex: 0, charCount: 21 },
        ];
        const scored = scoreRelevance(chunks, 'sales');
        // "sale" stem should partially match "selling"
        expect(scored[0].text).toContain('selling');
    });
});
// ── assembleContext ──────────────────────────────────────────────────────────
describe('assembleContext', () => {
    it('respects maxChars limit', () => {
        const chunks = Array.from({ length: 20 }, (_, i) => ({
            text: 'A'.repeat(200),
            role: 'assistant',
            msgIndex: i,
            charCount: 200,
            score: 10 - i * 0.1,
        }));
        const result = assembleContext(chunks, 500);
        expect(result.relevant).toBe(true);
        expect(result.totalChars).toBeLessThanOrEqual(600); // some slack for the limit logic
    });
    it('preserves conversation order in output', () => {
        const chunks = [
            { text: 'First message', role: 'user', msgIndex: 0, charCount: 13, score: 5 },
            { text: 'Second message', role: 'assistant', msgIndex: 1, charCount: 14, score: 8 },
            { text: 'Third message', role: 'user', msgIndex: 2, charCount: 13, score: 6 },
        ];
        const result = assembleContext(chunks, 3000);
        expect(result.relevant).toBe(true);
        const lines = result.context.split('\n');
        // Even though score order is 1,2,0 — output should be in msgIndex order
        expect(lines[0]).toContain('First');
        expect(lines[1]).toContain('Second');
        expect(lines[2]).toContain('Third');
    });
    it('inserts [...] for gaps between selected chunks', () => {
        const chunks = [
            { text: 'Message 0', role: 'user', msgIndex: 0, charCount: 9, score: 8 },
            { text: 'Message 5', role: 'assistant', msgIndex: 5, charCount: 9, score: 7 },
        ];
        const result = assembleContext(chunks, 3000);
        expect(result.context).toContain('[...]');
    });
    it('returns relevant: false when no chunks score above threshold', () => {
        const chunks = [
            { text: 'Low score text', role: 'user', msgIndex: 0, charCount: 14, score: 1.5 },
            { text: 'Another low', role: 'user', msgIndex: 1, charCount: 11, score: 0.5 },
        ];
        const result = assembleContext(chunks);
        expect(result.relevant).toBe(false);
        expect(result.context).toBe('');
    });
    it('handles empty input', () => {
        expect(assembleContext([])).toEqual({ relevant: false, context: '' });
        expect(assembleContext(null)).toEqual({ relevant: false, context: '' });
    });
    it('returns chunk count and total chars', () => {
        const chunks = [
            { text: 'Data point one', role: 'assistant', msgIndex: 0, charCount: 14, score: 5 },
            { text: 'Data point two', role: 'assistant', msgIndex: 1, charCount: 14, score: 4 },
        ];
        const result = assembleContext(chunks, 3000);
        expect(result.chunkCount).toBe(2);
        expect(result.totalChars).toBe(28);
    });
});
