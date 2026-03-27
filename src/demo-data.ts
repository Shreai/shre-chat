// ── Demo Data ─────────────────────────────────────────────────────────
// Pre-loaded sample conversations for demo mode.
// Each conversation shows realistic agent responses with structured data.

export interface DemoMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface DemoConversation {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  messages: DemoMessage[];
}

const now = Date.now();
const min = 60_000;

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    id: "demo-sales-summary",
    title: "Today's Sales Summary",
    agentId: "storepulse",
    agentName: "StorePulse",
    agentEmoji: "\uD83D\uDECD\uFE0F",
    messages: [
      {
        role: "user",
        content: "Show me today's sales summary",
        timestamp: now - 10 * min,
      },
      {
        role: "assistant",
        content: `Here's your sales summary for today:

| Metric | Value |
|--------|-------|
| Total Revenue | **$12,847.32** |
| Transactions | **187** |
| Avg Ticket | **$68.70** |
| Items Sold | **432** |
| Returns | **3 ($142.50)** |

**Top Categories:**
1. Tobacco & Nicotine — $4,210 (32.8%)
2. Beverages — $2,890 (22.5%)
3. Snacks & Candy — $1,920 (14.9%)
4. Grocery — $1,650 (12.8%)
5. Lottery — $1,180 (9.2%)

**Hourly Peak:** 11 AM - 1 PM (62 transactions, $4,320)

Revenue is **+8.3%** vs same day last week. Beverage sales jumped 15% — likely the new energy drink promo is driving traffic.`,
        timestamp: now - 9 * min,
      },
    ],
  },
  {
    id: "demo-inventory-alerts",
    title: "Low Inventory Alerts",
    agentId: "storepulse",
    agentName: "StorePulse",
    agentEmoji: "\uD83D\uDECD\uFE0F",
    messages: [
      {
        role: "user",
        content: "Which items are low on inventory?",
        timestamp: now - 8 * min,
      },
      {
        role: "assistant",
        content: `Found **7 items** below reorder threshold:

| Item | On Hand | Reorder Point | Status |
|------|---------|---------------|--------|
| Marlboro Gold Kings | 12 packs | 50 | \u26A0\uFE0F Critical |
| Red Bull 8.4oz | 18 units | 48 | \u26A0\uFE0F Critical |
| Coca-Cola 20oz | 24 units | 36 | \u26A0\uFE0F Low |
| Doritos Nacho Cheese | 8 bags | 24 | \u26A0\uFE0F Low |
| Bic Classic Lighter | 15 units | 30 | \u26A0\uFE0F Low |
| Powerade Mountain Berry | 6 units | 18 | \u26A0\uFE0F Low |
| Jack Link's Beef Jerky | 4 bags | 12 | \u26A0\uFE0F Low |

**Recommended Actions:**
- Place emergency order for Marlboro Gold and Red Bull (2-3 day lead time)
- Standard reorder for remaining items via your McLane distribution schedule
- Consider increasing Doritos reorder point — it's sold out 3 times this month

Want me to draft the purchase orders?`,
        timestamp: now - 7 * min,
      },
    ],
  },
  {
    id: "demo-weekly-comparison",
    title: "This Week vs Last Week",
    agentId: "storepulse",
    agentName: "StorePulse",
    agentEmoji: "\uD83D\uDECD\uFE0F",
    messages: [
      {
        role: "user",
        content: "Compare this week vs last week",
        timestamp: now - 6 * min,
      },
      {
        role: "assistant",
        content: `**Weekly Performance Comparison** (Mon-Thu so far)

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| Revenue | $48,230 | $44,890 | \u2B06\uFE0F **+7.4%** |
| Transactions | 712 | 685 | \u2B06\uFE0F +3.9% |
| Avg Ticket | $67.74 | $65.53 | \u2B06\uFE0F +3.4% |
| Gross Margin | 34.2% | 33.8% | \u2B06\uFE0F +0.4pp |
| Customer Count | 683 | 661 | \u2B06\uFE0F +3.3% |
| Items/Transaction | 2.4 | 2.3 | \u2B06\uFE0F +4.3% |

**Category Movers:**
- \u2B06\uFE0F Beverages: +15.2% ($8,420 vs $7,310) — new energy drink promo
- \u2B06\uFE0F Tobacco: +4.1% ($15,890 vs $15,260)
- \u2B07\uFE0F Lottery: -8.3% ($3,450 vs $3,760) — no jackpot excitement this week
- \u2B06\uFE0F Snacks: +12.7% ($7,280 vs $6,460) — BOGO display is working

**Key Insight:** The front-of-store energy drink cooler and BOGO snack display are driving a +$3,340 weekly uplift. Recommend extending both through next week.`,
        timestamp: now - 5 * min,
      },
    ],
  },
  {
    id: "demo-promotions",
    title: "Expiring Promotions",
    agentId: "storepulse",
    agentName: "StorePulse",
    agentEmoji: "\uD83D\uDECD\uFE0F",
    messages: [
      {
        role: "user",
        content: "What promotions are expiring?",
        timestamp: now - 4 * min,
      },
      {
        role: "assistant",
        content: `Found **5 active promotions** — 3 expiring within 7 days:

**\u26A0\uFE0F Expiring This Week:**

| Promotion | Type | Expires | Revenue Impact |
|-----------|------|---------|----------------|
| Monster Energy 2/$5 | Multi-buy | **Mar 28** (tomorrow) | $1,240/week |
| Doritos/Cheetos BOGO | BOGO | **Mar 30** (3 days) | $890/week |
| Marlboro $1 Off Pack | Manufacturer | **Mar 31** (4 days) | $2,100/week |

**Still Running:**

| Promotion | Type | Expires | Revenue Impact |
|-----------|------|---------|----------------|
| Lottery Scratch-Off Bundle | Bundle | Apr 15 | $680/week |
| Coffee Any Size $1.49 | Price Override | Apr 30 | $450/week |

**Recommendations:**
1. **Extend Monster Energy promo** — it's driving foot traffic and basket size. Contact distributor for renewal terms.
2. **Let Doritos BOGO expire** — margins are thin. Switch to a 20% off single-bag deal.
3. **Marlboro $1 Off** expires automatically (manufacturer-funded). New Camel promo starts Apr 1.

Want me to draft the extension request to your Monster rep?`,
        timestamp: now - 3 * min,
      },
    ],
  },
];

export const DEMO_SUGGESTIONS: string[] = [
  "Show me today's sales summary",
  "Which items are low on inventory?",
  "Compare this week vs last week",
  "What promotions are expiring?",
  "Who are my top 10 customers?",
  "Show me hourly traffic patterns",
  "What's my best margin category?",
  "Any employee schedule conflicts?",
];

export const DEMO_MAX_MESSAGES = 5;
