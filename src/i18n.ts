// Shre Chat i18n — client-side internationalization
// Fetches translations from shre-i18n service, falls back to bundled English

type TranslationMap = Record<string, string | Record<string, string | Record<string, string>>>;

export type Locale = "en" | "es" | "de" | "fr" | "pt-BR" | "zh-CN" | "zh-TW" | "hi" | "ar" | "ja" | "ko" | "ru" | "it" | "nl" | "tr";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  "pt-BR": "Português (Brasil)",
  "zh-CN": "中文 (简体)",
  "zh-TW": "中文 (繁體)",
  hi: "हिन्दी",
  ar: "العربية",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  it: "Italiano",
  nl: "Nederlands",
  tr: "Türkçe",
};

// ── Bundled English fallback (always available) ──
const FALLBACK_EN: Record<string, string> = {
  "chat.placeholder": "Type a message...",
  "chat.send": "Send",
  "chat.thinking": "Thinking...",
  "chat.newConversation": "New conversation",
  "chat.agentLabel": "Agent",
  "chat.userLabel": "You",
  "chat.voiceStart": "Start voice input",
  "chat.voiceStop": "Stop recording",
  "chat.connectionLost": "Connection lost — reconnecting...",
  "chat.connectionRestored": "Connection restored",
  "chat.tooManySessions": "Too many active sessions — please wait",
  "sidebar.agents": "Agents",
  "sidebar.sessions": "Sessions",
  "sidebar.settings": "Settings",
  "sidebar.tools": "Tools",
  "sidebar.skills": "Skills",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "login.title": "Welcome to Shre AI",
  "login.subtitle": "Sign in to continue",
  "login.loginButton": "Sign In",
  "login.otpTitle": "Verification Code",
  "login.verifyButton": "Verify",
  "login.skipFuture": "Skip verification for 30 days",
  "voice.recording": "Recording...",
  "voice.transcribing": "Transcribing...",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.ok": "OK",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.send": "Send",
  "common.copy": "Copy",
  "common.copied": "Copied!",
  "nav.home": "Home",
  "nav.back": "Back",
  "nav.settings": "Settings",
  "auth.login": "Sign In",
  "auth.logout": "Sign Out",
  "auth.unauthorized": "Unauthorized — please sign in",
  "language.title": "Language",
  "language.subtitle": "Choose your preferred language",
};

// ── State ──
let currentLocale: Locale = "en";
let translations: Record<string, string> = { ...FALLBACK_EN };
let commonTranslations: Record<string, string> = {};
const subscribers = new Set<() => void>();

// ── Flatten nested objects ──
function flatten(obj: any, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      Object.assign(result, flatten(val, fullKey));
    } else if (typeof val === "string") {
      result[fullKey] = val;
    }
  }
  return result;
}

// ── Fetch translations from shre-i18n service ──
async function fetchTranslations(locale: Locale, service: string): Promise<Record<string, string>> {
  try {
    // Try shre-i18n service first
    const res = await fetch(`/api/i18n/translations/${service}/${locale}`, {
      signal: AbortSignal.timeout(3000),
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return flatten(data);
    }
  } catch {
    // Fallback — service unavailable
  }
  return {};
}

// ── Set locale ──
export async function setLocale(locale: Locale): Promise<void> {
  if (locale === currentLocale && Object.keys(translations).length > Object.keys(FALLBACK_EN).length) {
    return; // Already loaded
  }

  currentLocale = locale;
  localStorage.setItem("shre.locale", locale);

  if (locale === "en") {
    translations = { ...FALLBACK_EN };
    commonTranslations = {};
  } else {
    // Fetch both common and service-specific translations
    const [common, chat] = await Promise.all([
      fetchTranslations(locale, "common"),
      fetchTranslations(locale, "shre-chat"),
    ]);
    commonTranslations = common;
    translations = { ...FALLBACK_EN, ...common, ...chat };
  }

  // Persist preference server-side
  try {
    await fetch("/api/i18n/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
      credentials: "include",
    });
  } catch {
    // Best-effort — works offline with localStorage
  }

  // Notify subscribers
  for (const fn of subscribers) fn();
}

// ── Get current locale ──
export function getLocale(): Locale {
  return currentLocale;
}

// ── Translate ──
export function t(key: string, params?: Record<string, string | number>): string {
  let text = translations[key] || FALLBACK_EN[key] || key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }

  return text;
}

// ── Subscribe to locale changes (for React re-renders) ──
export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ── Initialize — resolve locale from localStorage, server, or browser ──
export async function initI18n(): Promise<void> {
  // Priority: localStorage > server-side preference > browser language > "en"
  const stored = localStorage.getItem("shre.locale") as Locale | null;
  if (stored && stored in LOCALE_LABELS) {
    await setLocale(stored);
    return;
  }

  // Try to get from server (user's saved preference)
  try {
    const res = await fetch("/api/i18n/locale", {
      credentials: "include",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const { effectiveLocale } = await res.json();
      if (effectiveLocale && effectiveLocale in LOCALE_LABELS) {
        await setLocale(effectiveLocale as Locale);
        return;
      }
    }
  } catch {
    // Server unavailable — use browser locale
  }

  // Browser language detection
  const browserLang = navigator.language;
  const resolved = resolveBrowserLocale(browserLang);
  await setLocale(resolved);
}

function resolveBrowserLocale(lang: string): Locale {
  // Exact match
  if (lang in LOCALE_LABELS) return lang as Locale;

  // Prefix match
  const prefix = lang.split("-")[0];
  const prefixMap: Record<string, Locale> = { zh: "zh-CN", pt: "pt-BR" };
  if (prefixMap[prefix]) return prefixMap[prefix];

  const match = Object.keys(LOCALE_LABELS).find(l => l.toLowerCase() === prefix);
  if (match) return match as Locale;

  return "en";
}

// ── Get available locales (optionally filtered by workspace policy) ──
export async function getAvailableLocales(): Promise<{ locale: Locale; label: string }[]> {
  try {
    const res = await fetch("/api/i18n/available", {
      credentials: "include",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const { locales } = await res.json();
      return locales.map((l: Locale) => ({ locale: l, label: LOCALE_LABELS[l] || l }));
    }
  } catch (_) { void _; }

  // Fallback — return all
  return Object.entries(LOCALE_LABELS).map(([locale, label]) => ({ locale: locale as Locale, label }));
}
