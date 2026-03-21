import React from "react";

export function SBadge({ children, variant, className, ...props }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium";
  const variants = {
    default: "",
    success: "",
    warning: "",
    danger: "",
    destructive: "",
    info: "",
    outline: "",
    secondary: "",
  };
  const colorMap = {
    default: { background: "var(--c-bg-3)", color: "var(--c-text-2)" },
    success: { background: "rgba(52,199,89,0.15)", color: "var(--c-success)" },
    warning: { background: "rgba(255,204,0,0.15)", color: "var(--c-warning)" },
    danger: { background: "var(--c-danger-bg)", color: "var(--c-danger)" },
    destructive: { background: "var(--c-danger-bg)", color: "var(--c-danger)" },
    info: { background: "rgba(99,141,255,0.12)", color: "var(--c-accent)" },
    outline: { background: "transparent", color: "var(--c-text-3)", border: "1px solid var(--c-border-2)" },
    secondary: { background: "var(--c-bg-3)", color: "var(--c-text-2)" },
  };
  return React.createElement(
    "span",
    { className: `${base} ${className || ""}`, style: colorMap[variant] || colorMap.default, ...props },
    children
  );
}

export const SButton = React.forwardRef(function SButton({ children, variant, size, className, disabled, onClick, type, style: userStyle, ...props }, ref) {
  const base = "inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    xs: "px-2 py-1 text-xs",
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  const colorMap = {
    default: { background: "var(--c-accent)", color: "#fff" },
    primary: { background: "var(--c-accent)", color: "#fff" },
    secondary: { background: "var(--c-bg-3)", color: "var(--c-text-2)" },
    outline: { background: "transparent", color: "var(--c-text-2)", border: "1px solid var(--c-border-2)" },
    ghost: { background: "transparent", color: "var(--c-text-3)" },
    destructive: { background: "var(--c-danger)", color: "#fff" },
  };
  return React.createElement(
    "button",
    {
      ref,
      type: type || "button",
      disabled,
      onClick,
      className: `${base} ${sizes[size] || sizes.md} ${className || ""}`,
      style: { ...(colorMap[variant] || colorMap.default), ...userStyle },
      ...props,
    },
    children
  );
});

export const SInput = React.forwardRef(function SInput({ className, style: userStyle, ...props }, ref) {
  return React.createElement("input", {
    ref,
    className: `w-full rounded-lg px-3 py-2 text-sm focus:outline-none placeholder:opacity-40 ${className || ""}`,
    style: {
      background: "var(--c-bg-2)",
      color: "var(--c-text-1)",
      border: "1px solid var(--c-border-2)",
      ...userStyle,
    },
    ...props,
  });
});

export function SDialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return React.createElement(
    "div",
    { className: "fixed inset-0 z-50 flex items-center justify-center" },
    React.createElement("div", {
      className: "absolute inset-0",
      style: { background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" },
      onClick: () => onOpenChange?.(false),
    }),
    React.createElement("div", { className: "relative z-10 w-full flex items-center justify-center" }, children)
  );
}

export function SDialogContent({ children, className, style, ...props }) {
  return React.createElement(
    "div",
    {
      className: `rounded-2xl p-6 max-w-lg w-full mx-4 ${className || ""}`,
      style: {
        background: "var(--c-bg-2)",
        border: "1px solid var(--c-border-2)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
        ...style,
      },
      ...props,
    },
    children
  );
}

export function SDialogHeader({ children, className }) {
  return React.createElement("div", { className: `mb-4 ${className || ""}` }, children);
}

export function SDialogTitle({ children, className }) {
  return React.createElement("h2", {
    className: `text-lg font-semibold ${className || ""}`,
    style: { color: "var(--c-text-1)" },
  }, children);
}

export function SDialogFooter({ children, className }) {
  return React.createElement("div", { className: `mt-6 flex justify-end gap-2 ${className || ""}` }, children);
}

export function SSeparator({ className }) {
  return React.createElement("hr", {
    className: `my-4 border-0 ${className || ""}`,
    style: { height: 1, background: "var(--c-border-2)" },
  });
}

export function PoweredByNirlab({ className, variant }) {
  const textColor = "var(--c-text-5)";
  if (variant === "badge") {
    return React.createElement(
      "div",
      {
        className: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${className || ""}`,
        style: { background: "var(--c-bg-3)", border: "1px solid var(--c-border-2)", color: textColor },
      },
      React.createElement("span", { style: { fontWeight: 600, color: "var(--c-text-3)" } }, "Nirlab")
    );
  }
  if (variant === "inline") {
    return React.createElement(
      "span",
      { className: `text-xs ${className || ""}`, style: { color: textColor } },
      "Powered by Nirlab"
    );
  }
  return React.createElement(
    "div",
    { className: `text-xs text-center ${className || ""}`, style: { color: textColor } },
    "Powered by Nirlab"
  );
}

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
