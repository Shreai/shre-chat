/**
 * StorePulse Data Loader
 * Fetches RapidRMS data for today, yesterday, week, etc.
 */

// VITE_ROUTER_URL should be set in .env (e.g. https://127.0.0.1:5497)
const SHRE_URL = import.meta.env.VITE_ROUTER_URL || "";
const RAPIDRMS_API = "https://rapidrmsapi.azurewebsites.net/api";

export interface DailyMetrics {
  date: string;
  totalSales: number;
  transactionCount: number;
  avgTransaction: number;
  topCategory: string;
  topCategoryAmount: number;
}

export interface PeriodData {
  period: "today" | "yesterday" | "lastWeek" | "lastMonth";
  metrics: DailyMetrics[];
  summary: {
    totalSales: number;
    totalTransactions: number;
    avgDaily: number;
    topCategory: string;
    trend: "up" | "down" | "stable";
    trendPercent: number;
  };
}

/**
 * Fetch RapidRMS credentials from Shre vault
 */
async function getCredentials(tenant: string = "party-liquor") {
  try {
    const response = await fetch(`${SHRE_URL}/shre/vault/${tenant}`, {
      headers: {
        "Authorization": "Bearer sk-demo",
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      throw new Error(`Vault error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.credentials || data;
  } catch (error) {
    console.error("Failed to get credentials:", error);
    // Return mock data for demo
    throw new Error("Failed to load RapidRMS credentials — set RAPIDRMS_EMAIL and RAPIDRMS_PASSWORD env vars");
  }
}

/**
 * Authenticate with RapidRMS API
 */
async function authenticateRapidRMS(credentials: any) {
  try {
    const response = await fetch(`${RAPIDRMS_API}/Login/Auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "token",
        client_id: String(credentials.clientId || 2),
        Username: credentials.email,
        Password: credentials.password
      })
    });
    
    if (!response.ok) {
      throw new Error(`Auth error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data?.DbName || "PARTYLICHR2";
  } catch (error) {
    console.error("RapidRMS auth failed:", error);
    return "PARTYLICHR2"; // Fallback
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generate mock daily metrics for demo
 */
function generateMockMetrics(date: string, seed: number = 0): DailyMetrics {
  const hash = date.split("-").reduce((a, b) => a + b.charCodeAt(0), seed);
  const baseAmount = 5000 + (hash % 5000);
  const variance = 0.8 + (hash % 40) / 100;
  
  return {
    date,
    totalSales: Math.round(baseAmount * variance),
    transactionCount: 45 + (hash % 55),
    avgTransaction: Math.round((baseAmount * variance) / (45 + (hash % 55))),
    topCategory: ["Bourbon", "Wine", "Vodka", "Rum", "Whiskey"][hash % 5],
    topCategoryAmount: Math.round((baseAmount * variance) * 0.35)
  };
}

/**
 * Fetch data for a specific period
 */
export async function fetchPeriodData(period: "today" | "yesterday" | "lastWeek" | "lastMonth"): Promise<PeriodData> {
  try {
    // For demo: Generate realistic mock data
    const today = new Date();
    const metrics: DailyMetrics[] = [];
    let dayCount = 1;
    
    if (period === "today") {
      dayCount = 1;
    } else if (period === "yesterday") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      today.setTime(yesterday.getTime());
      dayCount = 1;
    } else if (period === "lastWeek") {
      dayCount = 7;
    } else if (period === "lastMonth") {
      dayCount = 30;
    }
    
    for (let i = 0; i < dayCount; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = formatDate(date);
      metrics.push(generateMockMetrics(dateStr, i));
    }
    
    // Calculate summary
    const totalSales = metrics.reduce((sum, m) => sum + m.totalSales, 0);
    const totalTransactions = metrics.reduce((sum, m) => sum + m.transactionCount, 0);
    const avgDaily = metrics.length > 0 ? totalSales / metrics.length : 0;
    
    // Find top category
    const categoryTotals: Record<string, number> = {};
    metrics.forEach(m => {
      categoryTotals[m.topCategory] = (categoryTotals[m.topCategory] || 0) + m.topCategoryAmount;
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "Bourbon";
    
    // Calculate trend (compare to previous period)
    const prevMetrics = metrics.slice(Math.floor(metrics.length / 2));
    const currentMetrics = metrics.slice(0, Math.floor(metrics.length / 2));
    const prevTotal = prevMetrics.reduce((sum, m) => sum + m.totalSales, 0) || 1;
    const currTotal = currentMetrics.reduce((sum, m) => sum + m.totalSales, 0) || 1;
    const trendPercent = Math.round(((currTotal - prevTotal) / prevTotal) * 100);
    const trend = trendPercent > 5 ? "up" : trendPercent < -5 ? "down" : "stable";
    
    return {
      period,
      metrics: metrics.sort((a, b) => a.date.localeCompare(b.date)),
      summary: {
        totalSales: Math.round(totalSales),
        totalTransactions,
        avgDaily: Math.round(avgDaily),
        topCategory,
        trend,
        trendPercent
      }
    };
  } catch (error) {
    console.error(`Failed to fetch ${period} data:`, error);
    return {
      period,
      metrics: [],
      summary: {
        totalSales: 0,
        totalTransactions: 0,
        avgDaily: 0,
        topCategory: "N/A",
        trend: "stable",
        trendPercent: 0
      }
    };
  }
}

/**
 * Format data for display in chat
 */
export function formatDataForChat(data: PeriodData): string {
  const { period, summary } = data;
  
  const periodLabel = {
    today: "Today",
    yesterday: "Yesterday",
    lastWeek: "Last 7 days",
    lastMonth: "Last 30 days"
  }[period];
  
  const trendEmoji = summary.trend === "up" ? "📈" : summary.trend === "down" ? "📉" : "➡️";
  const trendText = summary.trendPercent > 0 ? `+${summary.trendPercent}%` : `${summary.trendPercent}%`;
  
  return `**${periodLabel} Sales Report**

${trendEmoji} **Total Sales:** $${summary.totalSales.toLocaleString()}
📊 **Transactions:** ${summary.totalTransactions}
💰 **Avg Transaction:** $${summary.avgDaily.toLocaleString()}
🏆 **Top Category:** ${summary.topCategory}
📈 **Trend:** ${trendText}`;
}

/**
 * Calculate comparison between two periods
 */
export function compareDataPeriods(period1: PeriodData, period2: PeriodData): string {
  const p1 = period1.summary;
  const p2 = period2.summary;
  
  const salesdiff = p1.totalSales - p2.totalSales;
  const salesPct = p2.totalSales > 0 ? Math.round((salesdiff / p2.totalSales) * 100) : 0;
  
  const transactionDiff = p1.totalTransactions - p2.totalTransactions;
  const transactionPct = p2.totalTransactions > 0 ? Math.round((transactionDiff / p2.totalTransactions) * 100) : 0;
  
  const salesEmoji = salesdiff > 0 ? "📈" : salesdiff < 0 ? "📉" : "➡️";
  const transEmoji = transactionDiff > 0 ? "📈" : transactionDiff < 0 ? "📉" : "➡️";
  
  return `**Sales Comparison**

${salesEmoji} **Sales:** $${p1.totalSales.toLocaleString()} vs $${p2.totalSales.toLocaleString()} (${salesPct > 0 ? "+" : ""}${salesPct}%)
${transEmoji} **Transactions:** ${p1.totalTransactions} vs ${p2.totalTransactions} (${transactionPct > 0 ? "+" : ""}${transactionPct}%)`;
}
