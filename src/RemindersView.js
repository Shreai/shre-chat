import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
function getToken() {
    return sessionStorage.getItem('shre-auth-token') || localStorage.getItem('shre-auth-token') || '';
}
async function apiFetch(path, opts = {}) {
    const res = await fetch(path, {
        ...opts,
        headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
            ...opts.headers,
        },
    });
    if (!res.ok)
        throw new Error(`${res.status}`);
    return res.json();
}
export function RemindersView() {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCompleted, setShowCompleted] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [formText, setFormText] = useState('');
    const [formDate, setFormDate] = useState('');
    const [formTime, setFormTime] = useState('');
    const [formRecurring, setFormRecurring] = useState('');
    const [nlInput, setNlInput] = useState('');
    const [nlParsing, setNlParsing] = useState(false);
    const inputRef = useRef(null);
    const load = useCallback(async () => {
        try {
            const data = await apiFetch('/api/reminders');
            setReminders(data.reminders || []);
        }
        catch {
            /* ignore */
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);
    // Request notification permission on first interaction (user-gesture-driven)
    const requestNotifPermission = useCallback(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);
    // Check for due reminders every 30s and notify
    useEffect(() => {
        if (!('Notification' in window))
            return;
        const check = setInterval(async () => {
            try {
                const data = await apiFetch('/api/reminders/due');
                if (data.due?.length > 0) {
                    for (const r of data.due) {
                        if (Notification.permission === 'granted') {
                            new Notification('Shre Reminder', {
                                body: r.text,
                                icon: '/assets/icon-192.png',
                                tag: r.id,
                            });
                        }
                    }
                    load(); // refresh list
                }
            }
            catch {
                /* ignore */
            }
        }, 30_000);
        return () => clearInterval(check);
    }, [load]);
    async function createReminder(e) {
        e?.preventDefault();
        if (!formText.trim() || !formDate)
            return;
        requestNotifPermission(); // user-gesture-driven permission request
        const due = formTime ? `${formDate}T${formTime}:00` : `${formDate}T09:00:00`;
        try {
            await apiFetch('/api/reminders', {
                method: 'POST',
                body: JSON.stringify({
                    text: formText.trim(),
                    due: new Date(due).toISOString(),
                    recurring: formRecurring || null,
                }),
            });
            setFormText('');
            setFormDate('');
            setFormTime('');
            setFormRecurring('');
            setShowForm(false);
            load();
        }
        catch {
            /* ignore */
        }
    }
    async function parseNaturalLanguage() {
        if (!nlInput.trim())
            return;
        setNlParsing(true);
        try {
            const data = await apiFetch('/api/reminders/parse', {
                method: 'POST',
                body: JSON.stringify({ text: nlInput.trim() }),
            });
            if (data.text && data.due) {
                setFormText(data.text);
                const d = new Date(data.due);
                setFormDate(d.toISOString().split('T')[0]);
                setFormTime(d.toTimeString().slice(0, 5));
                setFormRecurring(data.recurring || '');
                setShowForm(true);
                setNlInput('');
            }
        }
        catch {
            /* ignore */
        }
        finally {
            setNlParsing(false);
        }
    }
    async function toggleComplete(id) {
        const r = reminders.find((r) => r.id === id);
        if (!r)
            return;
        try {
            await apiFetch(`/api/reminders/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ completed: !r.completed }),
            });
            load();
        }
        catch {
            /* ignore */
        }
    }
    async function snooze(id, minutes) {
        const snoozed = new Date(Date.now() + minutes * 60_000).toISOString();
        try {
            await apiFetch(`/api/reminders/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ snoozed }),
            });
            load();
        }
        catch {
            /* ignore */
        }
    }
    async function deleteReminder(id) {
        try {
            await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });
            load();
        }
        catch {
            /* ignore */
        }
    }
    const now = new Date();
    const active = reminders.filter((r) => !r.completed);
    const completed = reminders.filter((r) => r.completed);
    const overdue = active.filter((r) => new Date(r.snoozed || r.due) < now);
    const upcoming = active
        .filter((r) => new Date(r.snoozed || r.due) >= now)
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    if (loading)
        return (_jsx("div", { className: "flex-1 flex items-center justify-center", style: { background: 'var(--c-bg)' }, children: _jsx("div", { className: "animate-pulse text-sm", style: { color: 'var(--c-text-3)' }, children: "Loading reminders..." }) }));
    return (_jsx("div", { className: "flex-1 overflow-y-auto", style: { background: 'var(--c-bg)' }, children: _jsxs("div", { className: "max-w-2xl mx-auto px-4 py-6 space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-xl font-bold", style: { color: 'var(--c-text-1)' }, children: "Reminders" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: () => setShowCompleted(!showCompleted), className: "text-xs px-2 py-1 rounded", style: { background: 'var(--c-bg-2)', color: 'var(--c-text-3)' }, children: [showCompleted ? 'Hide' : 'Show', " completed (", completed.length, ")"] }), _jsx("button", { onClick: () => {
                                        setShowForm(!showForm);
                                        setTimeout(() => inputRef.current?.focus(), 100);
                                    }, className: "px-3 py-1.5 rounded-lg text-xs font-medium", style: { background: 'var(--c-accent)', color: 'var(--c-on-accent)' }, children: "+ New" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: nlInput, onChange: (e) => setNlInput(e.target.value), onKeyDown: (e) => {
                                if (e.key === 'Enter')
                                    parseNaturalLanguage();
                            }, placeholder: 'Try: "Remind me to call supplier at 3pm tomorrow"', className: "flex-1 px-3 py-2.5 rounded-xl text-sm outline-none", style: {
                                background: 'var(--c-bg-2)',
                                color: 'var(--c-text-1)',
                                border: '1px solid var(--c-border-2)',
                            } }), _jsx("button", { onClick: parseNaturalLanguage, disabled: nlParsing || !nlInput.trim(), className: "px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40", style: { background: 'var(--c-accent)', color: 'var(--c-on-accent)' }, children: nlParsing ? '...' : 'Add' })] }), showForm && (_jsxs("form", { onSubmit: createReminder, className: "p-4 rounded-xl space-y-3", style: { background: 'var(--c-bg-2)' }, children: [_jsx("input", { ref: inputRef, value: formText, onChange: (e) => setFormText(e.target.value), placeholder: "What to remember...", className: "w-full px-3 py-2 rounded-lg text-sm outline-none", style: {
                                background: 'var(--c-bg)',
                                color: 'var(--c-text-1)',
                                border: '1px solid var(--c-border-2)',
                            } }), _jsxs("div", { className: "flex gap-2 flex-wrap", children: [_jsx("input", { type: "date", value: formDate, onChange: (e) => setFormDate(e.target.value), className: "px-2 py-1.5 rounded-lg text-sm", style: {
                                        background: 'var(--c-bg)',
                                        color: 'var(--c-text-1)',
                                        border: '1px solid var(--c-border-2)',
                                    } }), _jsx("input", { type: "time", value: formTime, onChange: (e) => setFormTime(e.target.value), className: "px-2 py-1.5 rounded-lg text-sm", style: {
                                        background: 'var(--c-bg)',
                                        color: 'var(--c-text-1)',
                                        border: '1px solid var(--c-border-2)',
                                    } }), _jsxs("select", { value: formRecurring, onChange: (e) => setFormRecurring(e.target.value), className: "px-2 py-1.5 rounded-lg text-sm", style: {
                                        background: 'var(--c-bg)',
                                        color: 'var(--c-text-1)',
                                        border: '1px solid var(--c-border-2)',
                                    }, children: [_jsx("option", { value: "", children: "One-time" }), _jsx("option", { value: "daily", children: "Daily" }), _jsx("option", { value: "weekly", children: "Weekly" }), _jsx("option", { value: "monthly", children: "Monthly" })] })] }), _jsxs("div", { className: "flex gap-2 justify-end", children: [_jsx("button", { type: "button", onClick: () => setShowForm(false), className: "px-3 py-1.5 rounded-lg text-xs", style: { color: 'var(--c-text-3)' }, children: "Cancel" }), _jsx("button", { type: "submit", disabled: !formText.trim() || !formDate, className: "px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40", style: { background: 'var(--c-accent)', color: 'var(--c-on-accent)' }, children: "Create" })] })] })), overdue.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsxs("h2", { className: "text-sm font-semibold flex items-center gap-2", style: { color: 'rgb(239,68,68)' }, children: [_jsxs("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), _jsx("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })] }), "Overdue (", overdue.length, ")"] }), overdue.map((r) => (_jsx(ReminderCard, { r: r, onToggle: toggleComplete, onSnooze: snooze, onDelete: deleteReminder }, r.id)))] })), upcoming.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsxs("h2", { className: "text-sm font-semibold", style: { color: 'var(--c-text-2)' }, children: ["Upcoming (", upcoming.length, ")"] }), upcoming.map((r) => (_jsx(ReminderCard, { r: r, onToggle: toggleComplete, onSnooze: snooze, onDelete: deleteReminder }, r.id)))] })), active.length === 0 && (_jsxs("div", { className: "py-12 text-center", children: [_jsx("p", { className: "text-sm", style: { color: 'var(--c-text-3)' }, children: "No active reminders" }), _jsx("p", { className: "text-xs mt-1", style: { color: 'var(--c-text-4)' }, children: "Try: \"Remind me to review PRs at 2pm\"" })] })), showCompleted && completed.length > 0 && (_jsxs("div", { className: "space-y-2 opacity-60", children: [_jsxs("h2", { className: "text-sm font-semibold", style: { color: 'var(--c-text-3)' }, children: ["Completed (", completed.length, ")"] }), completed.map((r) => (_jsx(ReminderCard, { r: r, onToggle: toggleComplete, onSnooze: snooze, onDelete: deleteReminder }, r.id)))] }))] }) }));
}
function ReminderCard({ r, onToggle, onSnooze, onDelete, }) {
    const [showSnooze, setShowSnooze] = useState(false);
    const isOverdue = !r.completed && new Date(r.snoozed || r.due) < new Date();
    const dueDate = new Date(r.due);
    const timeStr = dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const isToday = dueDate.toDateString() === new Date().toDateString();
    return (_jsxs("div", { className: "flex items-start gap-3 px-3 py-2.5 rounded-xl group", style: { background: isOverdue ? 'rgba(239,68,68,0.08)' : 'var(--c-bg-2)' }, children: [_jsx("button", { onClick: () => onToggle(r.id), className: "mt-0.5 flex-shrink-0", children: _jsx("div", { className: `w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${r.completed ? 'bg-green-500 border-green-500' : isOverdue ? 'border-red-400' : 'border-gray-400'}`, children: r.completed && (_jsx("svg", { className: "h-3 w-3 text-white", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) })) }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: `text-sm ${r.completed ? 'line-through' : ''}`, style: { color: r.completed ? 'var(--c-text-4)' : 'var(--c-text-1)' }, children: r.text }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [_jsx("span", { className: "text-[11px]", style: { color: isOverdue ? 'rgb(239,68,68)' : 'var(--c-text-4)' }, children: isToday ? `Today ${timeStr}` : `${dateStr} ${timeStr}` }), r.recurring && (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg)', color: 'var(--c-text-4)' }, children: r.recurring })), r.snoozed && (_jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'rgba(251,191,36,0.15)', color: 'rgb(251,191,36)' }, children: "snoozed" }))] })] }), _jsxs("div", { className: "flex items-center gap-1 opacity-50 sm:opacity-0 group-hover:opacity-100 transition-opacity", children: [!r.completed && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setShowSnooze(!showSnooze), className: "p-1 rounded", style: { color: 'var(--c-text-4)' }, title: "Snooze", children: _jsx("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M4 4l7.07 17 2.51-7.39L21 11.07z" }) }) }), showSnooze && (_jsx("div", { className: "flex gap-1", children: [15, 30, 60, 180].map((m) => (_jsx("button", { onClick: () => {
                                        onSnooze(r.id, m);
                                        setShowSnooze(false);
                                    }, className: "text-[10px] px-1.5 py-0.5 rounded", style: { background: 'var(--c-bg)', color: 'var(--c-text-3)' }, children: m < 60 ? `${m}m` : `${m / 60}h` }, m))) }))] })), _jsx("button", { onClick: () => {
                            if (confirm('Delete this reminder?'))
                                onDelete(r.id);
                        }, className: "p-1 rounded hover:text-red-500", style: { color: 'var(--c-text-4)' }, title: "Delete", children: _jsxs("svg", { className: "h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "3 6 5 6 21 6" }), _jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })] }) })] })] }));
}
