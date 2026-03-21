import { useState, useRef, useEffect } from "react";
import { SButton, SInput, SBadge, PoweredByNirlab } from "@shre/ui-kit";

interface LoginProps {
  onLogin: (token: string, user: { username: string; name: string; role: string }) => void;
}

const REMEMBER_KEY = "shre_remember_user";

export function LoginView({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpUsername, setOtpUsername] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (needs2FA) otpRef.current?.focus();
  }, [needs2FA]);

  // Auto-submit OTP when 6 digits entered
  useEffect(() => {
    if (otpCode.length === 6 && needs2FA && !loading) {
      handleVerify2FA();
    }
  }, [otpCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      if (data.requires2FA) {
        setNeeds2FA(true);
        setMaskedEmail(data.maskedEmail || "");
        setOtpUsername(username.trim());
        setLoading(false);
        return;
      }
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, username.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      onLogin(data.token, data.user);
    } catch {
      setError("Connection failed");
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otpCode.trim() || otpCode.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: otpUsername, code: otpCode.trim(), trustDevice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setLoading(false);
        return;
      }
      if (rememberMe) localStorage.setItem(REMEMBER_KEY, otpUsername);
      else localStorage.removeItem(REMEMBER_KEY);
      onLogin(data.token, data.user);
    } catch {
      setError("Connection failed");
      setLoading(false);
    }
  };

  const handleBack = () => {
    setNeeds2FA(false);
    setOtpCode("");
    setError("");
    setLoading(false);
  };

  // Eye icon SVG for password toggle
  const EyeIcon = ({ open }: { open: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
        </>
      )}
    </svg>
  );

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div className="w-full max-w-[380px] px-5">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl inline-flex items-center justify-center text-2xl font-bold text-white mb-4" style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: "0 8px 32px rgba(99, 102, 241, 0.3)",
          }}>S</div>
          <h1 className="text-[22px] font-semibold m-0 mb-1" style={{ color: "var(--c-text-1, #e2e8f0)" }}>Shre Chat</h1>
          <p className="text-[13px] m-0" style={{ color: "var(--c-text-4, #64748b)" }}>
            {needs2FA ? "Enter verification code" : "Sign in to continue"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7" style={{
          background: "rgba(30, 30, 50, 0.6)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(99, 102, 241, 0.15)",
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.3)",
        }}>
          {!needs2FA ? (
            /* Login Form */
            <form ref={formRef} onSubmit={handleSubmit} autoComplete="on">
              <input type="hidden" name="action" value="login" />
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-text-3, #94a3b8)" }}>
                  Username
                </label>
                <SInput
                  ref={inputRef}
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="bg-[rgba(15,15,30,0.8)] border-[rgba(99,102,241,0.2)] text-[var(--c-text-1,#e2e8f0)] rounded-[10px]"
                />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-text-3, #94a3b8)" }}>
                  Password
                </label>
                <div className="relative">
                  <SInput
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="bg-[rgba(15,15,30,0.8)] border-[rgba(99,102,241,0.2)] text-[var(--c-text-1,#e2e8f0)] rounded-[10px] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-1 flex items-center justify-center"
                    tabIndex={-1}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2 text-xs mb-5 cursor-pointer select-none" style={{ color: "var(--c-text-3, #94a3b8)" }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 cursor-pointer"
                  style={{ accentColor: "#6366f1" }}
                />
                Remember username
              </label>

              {error && (
                <SBadge variant="destructive" className="w-full justify-start px-3 py-2 mb-4 text-xs rounded-lg">
                  {error}
                </SBadge>
              )}

              <SButton
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full rounded-[10px] h-11 text-sm font-semibold"
                style={{
                  background: loading ? "rgba(99, 102, 241, 0.4)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  opacity: (!username.trim() || !password) ? 0.5 : 1,
                }}
              >{loading ? "Signing in..." : "Sign In"}</SButton>
            </form>
          ) : (
            /* 2FA Verification Form */
            <form onSubmit={handleVerify2FA}>
              <div className="rounded-[10px] p-3.5 mb-5" style={{
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.15)",
              }}>
                <div className="text-[13px] mb-1" style={{ color: "var(--c-purple, #c4b5fd)" }}>
                  Verification code sent to
                </div>
                <div className="text-sm font-medium" style={{ color: "var(--c-text-1, #e2e8f0)" }}>
                  {maskedEmail}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-text-3, #94a3b8)" }}>
                  6-digit code
                </label>
                <SInput
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="bg-[rgba(15,15,30,0.8)] border-[rgba(99,102,241,0.2)] text-[var(--c-text-1,#e2e8f0)] rounded-[10px] text-center text-2xl tracking-[8px] font-semibold"
                />
              </div>

              {/* Trust device checkbox */}
              <label className="flex items-center gap-2 text-xs mb-5 cursor-pointer select-none" style={{ color: "var(--c-text-3, #94a3b8)" }}>
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  className="w-3.5 h-3.5 cursor-pointer"
                  style={{ accentColor: "#6366f1" }}
                />
                Skip verification for 30 days on this device
              </label>

              {error && (
                <SBadge variant="destructive" className="w-full justify-start px-3 py-2 mb-4 text-xs rounded-lg">
                  {error}
                </SBadge>
              )}

              <SButton
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full rounded-[10px] h-11 text-sm font-semibold"
                style={{
                  background: loading ? "rgba(99, 102, 241, 0.4)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  opacity: otpCode.length !== 6 ? 0.5 : 1,
                }}
              >{loading ? "Verifying..." : "Verify"}</SButton>

              <SButton
                type="button"
                variant="outline"
                onClick={handleBack}
                className="w-full mt-2.5 rounded-[10px] h-10 text-[13px] border-[rgba(99,102,241,0.2)]"
                style={{ color: "var(--c-text-3, #94a3b8)" }}
              >Back to login</SButton>
            </form>
          )}
        </div>

        <div className="mt-5">
          <PoweredByNirlab variant="inline" />
        </div>
      </div>
    </div>
  );
}
