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
    destructive: "bg-red-800 text-red-200",
    info: "bg-blue-800 text-blue-200",
    outline: "border border-gray-500 text-gray-300 bg-transparent",
    secondary: "bg-gray-600 text-gray-100",
  };
  return React.createElement(
    "span",
    { className: `${base} ${variants[variant] || variants.default} ${className || ""}`, ...props },
    children
  );
}

// SButton — button component
export const SButton = React.forwardRef(function SButton({ children, variant, size, className, disabled, onClick, type, ...props }, ref) {
  const base = "inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-600 text-gray-100 hover:bg-gray-500",
    outline: "border border-gray-600 text-gray-200 hover:bg-gray-700",
    ghost: "text-gray-300 hover:bg-gray-700",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes = {
    xs: "px-2 py-1 text-xs",
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return React.createElement(
    "button",
    {
      ref,
      type: type || "button",
      disabled,
      onClick,
      className: `${base} ${variants[variant] || variants.default} ${sizes[size] || sizes.md} ${className || ""}`,
      ...props,
    },
    children
  );
});

// SInput — input component (with forwardRef so parent refs work)
export const SInput = React.forwardRef(function SInput({ className, ...props }, ref) {
  return React.createElement("input", {
    ref,
    className: `w-full rounded border border-gray-600 bg-gray-800 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500 ${className || ""}`,
    ...props,
  });
});

// SDialog — dialog wrapper
export function SDialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return React.createElement(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center",
    },
    // Backdrop — click it to close
    React.createElement("div", {
      className: "absolute inset-0 bg-black/60",
      onClick: () => onOpenChange?.(false),
    }),
    // Content wrapper — sits on top of backdrop
    React.createElement("div", { className: "relative z-10 w-full flex items-center justify-center" }, children)
  );
}

// SDialogContent — spread all props including style
export function SDialogContent({ children, className, style, ...props }) {
  return React.createElement(
    "div",
    {
      className: `bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 ${className || ""}`,
      style,
      ...props,
    },
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
// variant: "inline" (text only) | "badge" (pill with logo) | default (small centered text)
export function PoweredByNirlab({ className, variant }) {
  if (variant === "badge") {
    return React.createElement(
      "div",
      {
        className: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-400 ${className || ""}`,
      },
      React.createElement("span", { className: "font-semibold text-gray-300" }, "Nirlab")
    );
  }
  if (variant === "inline") {
    return React.createElement(
      "span",
      { className: `text-xs text-gray-500 ${className || ""}` },
      "Powered by Nirlab"
    );
  }
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
