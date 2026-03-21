import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, createThemeFromBranding, setBrandAssets } from "@shre/ui-kit";
import "./index.css";

// Detect Shre desktop app — add class to html for CSS targeting
if (navigator.userAgent.includes("Electron")) {
  document.documentElement.classList.add("shre-desktop");
}

// ── White-label bootstrap: apply workspace branding before React renders ──
async function bootstrapBranding() {
  try {
    const domain = window.location.hostname;
    const res = await fetch(`/api/branding/public?domain=${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.theme) {
        applyTheme(createThemeFromBranding(data));
      }
      if (data.logoUrl || data.faviconUrl) {
        setBrandAssets(data.logoUrl, data.faviconUrl);
      }
      if (data.brandName) {
        document.title = data.brandName;
      }
    }
  } catch {
    // Branding fetch failed — continue with defaults (non-blocking)
  }
}

// Apply branding then render (non-blocking — renders immediately if fetch is slow)
bootstrapBranding();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for offline app-shell caching + auto-update
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    // Check for updates every 5 minutes
    setInterval(() => reg.update(), 5 * 60 * 1000);
    // When a new SW is waiting, activate it immediately
    reg.addEventListener("updatefound", () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener("statechange", () => {
        if (newSW.state === "installed" && navigator.serviceWorker.controller) {
          // New version available — activate and reload
          newSW.postMessage("skipWaiting");
        }
      });
    });
  });
  // Reload when the new SW takes control
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
