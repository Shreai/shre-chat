import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { SButton, SInput, SBadge, PoweredByNirlab } from '@shre/ui-kit';
const REMEMBER_KEY = 'shre_remember_user';
export function LoginView({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [needs2FA, setNeeds2FA] = useState(false);
    const [maskedEmail, setMaskedEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpUsername, setOtpUsername] = useState('');
    const [trustDevice, setTrustDevice] = useState(true);
    const formRef = useRef(null);
    const inputRef = useRef(null);
    const otpRef = useRef(null);
    useEffect(() => {
        const saved = localStorage.getItem(REMEMBER_KEY);
        if (saved) {
            setUsername(saved);
            setRememberMe(true);
        }
        inputRef.current?.focus();
    }, []);
    useEffect(() => {
        if (needs2FA)
            otpRef.current?.focus();
    }, [needs2FA]);
    useEffect(() => {
        if (otpCode.length === 6 && needs2FA && !loading) {
            handleVerify2FA();
        }
    }, [otpCode]);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password)
            return;
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: username.trim(), password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Login failed');
                setLoading(false);
                return;
            }
            if (data.requires2FA) {
                setNeeds2FA(true);
                setMaskedEmail(data.maskedEmail || '');
                setOtpUsername(username.trim());
                setLoading(false);
                return;
            }
            if (rememberMe)
                localStorage.setItem(REMEMBER_KEY, username.trim());
            else
                localStorage.removeItem(REMEMBER_KEY);
            onLogin(data.token, data.user, data);
        }
        catch {
            setError('Connection failed');
            setLoading(false);
        }
    };
    const handleVerify2FA = async (e) => {
        if (e)
            e.preventDefault();
        if (!otpCode.trim() || otpCode.length !== 6)
            return;
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: otpUsername, code: otpCode.trim(), trustDevice }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Verification failed');
                setLoading(false);
                return;
            }
            if (rememberMe)
                localStorage.setItem(REMEMBER_KEY, otpUsername);
            else
                localStorage.removeItem(REMEMBER_KEY);
            onLogin(data.token, data.user, data);
        }
        catch {
            setError('Connection failed');
            setLoading(false);
        }
    };
    const handleBack = () => {
        setNeeds2FA(false);
        setOtpCode('');
        setError('');
        setLoading(false);
    };
    const EyeIcon = ({ open }) => (_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "var(--c-text-4, #6b6b76)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: open ? (_jsxs(_Fragment, { children: [_jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] })) : (_jsxs(_Fragment, { children: [_jsx("path", { d: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" }), _jsx("path", { d: "M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" }), _jsx("line", { x1: "1", y1: "1", x2: "23", y2: "23" }), _jsx("path", { d: "M14.12 14.12a3 3 0 11-4.24-4.24" })] })) }));
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center", style: {
            background: 'var(--c-bg-main, #0d0d0f)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }, children: _jsxs("div", { className: "w-full max-w-[380px] px-5", children: [_jsxs("div", { className: "text-center mb-8", children: [_jsx("div", { className: "w-14 h-14 rounded-2xl inline-flex items-center justify-center text-2xl font-bold text-white mb-4", style: {
                                background: 'var(--c-accent, #638dff)',
                                boxShadow: '0 8px 32px rgba(99,141,255,0.25)',
                            }, children: "S" }), _jsx("h1", { className: "text-[22px] font-semibold m-0 mb-1", style: { color: 'var(--c-text-1)' }, children: "Shre Chat" }), _jsx("p", { className: "text-[13px] m-0", style: { color: 'var(--c-text-4)' }, children: needs2FA ? 'Enter verification code' : 'Sign in to continue' })] }), _jsx("div", { className: "rounded-2xl p-7", style: {
                        background: 'var(--c-bg-2, #161618)',
                        border: '1px solid var(--c-border-2)',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
                    }, children: !needs2FA ? (_jsxs("form", { ref: formRef, onSubmit: handleSubmit, autoComplete: "on", children: [_jsx("input", { type: "hidden", name: "action", value: "login" }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Username" }), _jsx(SInput, { ref: inputRef, name: "username", type: "text", value: username, onChange: (e) => setUsername(e.target.value), autoComplete: "username", style: {
                                            background: 'var(--c-bg-1)',
                                            borderColor: 'var(--c-border-2)',
                                            borderRadius: 10,
                                        } })] }), _jsxs("div", { className: "mb-3", children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "Password" }), _jsxs("div", { className: "relative", children: [_jsx(SInput, { name: "password", type: showPassword ? 'text' : 'password', value: password, onChange: (e) => setPassword(e.target.value), autoComplete: "current-password", style: {
                                                    background: 'var(--c-bg-1)',
                                                    borderColor: 'var(--c-border-2)',
                                                    borderRadius: 10,
                                                    paddingRight: 40,
                                                } }), _jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), className: "absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-1 flex items-center justify-center", tabIndex: -1, title: showPassword ? 'Hide password' : 'Show password', children: _jsx(EyeIcon, { open: showPassword }) })] })] }), _jsxs("label", { className: "flex items-center gap-2 text-xs mb-5 cursor-pointer select-none", style: { color: 'var(--c-text-3)' }, children: [_jsx("input", { type: "checkbox", checked: rememberMe, onChange: (e) => setRememberMe(e.target.checked), className: "w-3.5 h-3.5 cursor-pointer", style: { accentColor: 'var(--c-accent, #638dff)' } }), "Remember username"] }), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-start px-3 py-2 mb-4 text-xs rounded-lg", children: error })), _jsx(SButton, { type: "submit", disabled: loading || !username.trim() || !password, className: "w-full h-11 text-sm font-semibold", style: {
                                    borderRadius: 10,
                                    background: loading ? 'rgba(99,141,255,0.4)' : 'var(--c-accent, #638dff)',
                                    opacity: !username.trim() || !password ? 0.5 : 1,
                                }, children: loading ? 'Signing in...' : 'Sign In' })] })) : (_jsxs("form", { onSubmit: handleVerify2FA, children: [_jsxs("div", { className: "rounded-[10px] p-3.5 mb-5", style: {
                                    background: 'rgba(99,141,255,0.08)',
                                    border: '1px solid rgba(99,141,255,0.15)',
                                }, children: [_jsx("div", { className: "text-[13px] mb-1", style: { color: 'var(--c-accent)' }, children: "Verification code sent to" }), _jsx("div", { className: "text-sm font-medium", style: { color: 'var(--c-text-1)' }, children: maskedEmail })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "block text-xs font-medium mb-1.5", style: { color: 'var(--c-text-3)' }, children: "6-digit code" }), _jsx(SInput, { ref: otpRef, type: "text", inputMode: "numeric", pattern: "[0-9]*", maxLength: 6, value: otpCode, onChange: (e) => setOtpCode(e.target.value.replace(/\D/g, '')), autoComplete: "one-time-code", placeholder: "000000", className: "text-center text-2xl tracking-[8px] font-semibold", style: {
                                            background: 'var(--c-bg-1)',
                                            borderColor: 'var(--c-border-2)',
                                            borderRadius: 10,
                                        } })] }), _jsxs("label", { className: "flex items-center gap-2 text-xs mb-5 cursor-pointer select-none", style: { color: 'var(--c-text-3)' }, children: [_jsx("input", { type: "checkbox", checked: trustDevice, onChange: (e) => setTrustDevice(e.target.checked), className: "w-3.5 h-3.5 cursor-pointer", style: { accentColor: 'var(--c-accent, #638dff)' } }), "Skip verification for 30 days on this device"] }), error && (_jsx(SBadge, { variant: "destructive", className: "w-full justify-start px-3 py-2 mb-4 text-xs rounded-lg", children: error })), _jsx(SButton, { type: "submit", disabled: loading || otpCode.length !== 6, className: "w-full h-11 text-sm font-semibold", style: {
                                    borderRadius: 10,
                                    background: loading ? 'rgba(99,141,255,0.4)' : 'var(--c-accent, #638dff)',
                                    opacity: otpCode.length !== 6 ? 0.5 : 1,
                                }, children: loading ? 'Verifying...' : 'Verify' }), _jsx(SButton, { type: "button", variant: "outline", onClick: handleBack, className: "w-full mt-2.5 h-10 text-[13px]", style: {
                                    borderRadius: 10,
                                    borderColor: 'var(--c-border-2)',
                                    color: 'var(--c-text-3)',
                                }, children: "Back to login" })] })) }), _jsx("div", { className: "mt-5 text-center", children: _jsx(PoweredByNirlab, { variant: "inline" }) })] }) }));
}
