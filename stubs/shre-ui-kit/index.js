// Stub @shre/ui-kit React components for Replit environment
import React from "react";

// SBadge — inline badge/chip component
export function SBadge({ children, variant, className, ...props }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";
  const variants = {
    default: "bg-gray-700 text-gray-200",
    success: "bg-green-800 text-green-200",
    warning: "bg-yellow-800 text-yellow-200",
    danger: "bg-red-800 text-red-200",
    info: "bg-blue-800 text-blue-200",
  };
  return React.createElement(
    "span",
    { className: `${base} ${variants[variant] || variants.default} ${className || ""}`, ...props },
    children
  );
}

// SButton — button component
export function SButton({ children, variant, size, className, disabled, onClick, type, ...props }) {
  const base = "inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-600 text-gray-200 hover:bg-gray-700",
    ghost: "text-gray-300 hover:bg-gray-700",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return React.createElement(
    "button",
    {
      type: type || "button",
      disabled,
      onClick,
      className: `${base} ${variants[variant] || variants.default} ${sizes[size] || sizes.md} ${className || ""}`,
      ...props,
    },
    children
  );
}

// SInput — input component
export function SInput({ className, ...props }) {
  return React.createElement("input", {
    className: `w-full rounded border border-gray-600 bg-gray-800 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500 ${className || ""}`,
    ...props,
  });
}

// SDialog — dialog wrapper
export function SDialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return React.createElement(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center",
      onClick: (e) => { if (e.target === e.currentTarget) onOpenChange?.(false); },
    },
    React.createElement("div", { className: "absolute inset-0 bg-black/60" }),
    React.createElement("div", { className: "relative z-10" }, children)
  );
}

// SDialogContent
export function SDialogContent({ children, className }) {
  return React.createElement(
    "div",
    { className: `bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 ${className || ""}` },
    children
  );
}

// SDialogHeader
export function SDialogHeader({ children, className }) {
  return React.createElement("div", { className: `mb-4 ${className || ""}` }, children);
}

// SDialogTitle
export function SDialogTitle({ children, className }) {
  return React.createElement("h2", { className: `text-lg font-semibold text-gray-100 ${className || ""}` }, children);
}

// SDialogFooter
export function SDialogFooter({ children, className }) {
  return React.createElement("div", { className: `mt-6 flex justify-end gap-2 ${className || ""}` }, children);
}

// SSeparator
export function SSeparator({ className }) {
  return React.createElement("hr", { className: `border-gray-700 my-4 ${className || ""}` });
}

// PoweredByNirlab — branding component
export function PoweredByNirlab({ className }) {
  return React.createElement(
    "div",
    { className: `text-xs text-gray-500 text-center ${className || ""}` },
    "Powered by Nirlab"
  );
}

// Theme utilities
export function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function createThemeFromBranding(branding) {
  if (!branding?.theme) return {};
  return branding.theme;
}

export function setBrandAssets(logoUrl, faviconUrl) {
  if (faviconUrl) {
    const link = document.querySelector("link[rel='icon']");
    if (link) link.href = faviconUrl;
  }
}

export default {};
