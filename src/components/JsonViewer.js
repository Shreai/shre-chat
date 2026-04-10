import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
const colors = {
    key: '#60a5fa',
    string: '#4ade80',
    number: '#f59e0b',
    boolean: '#a78bfa',
    null: 'rgba(255,255,255,0.3)',
    brace: 'rgba(255,255,255,0.4)',
    index: 'rgba(255,255,255,0.35)',
};
function CopyBtn({ value }) {
    const [copied, setCopied] = useState(false);
    return (_jsx("button", { onClick: (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(JSON.stringify(value, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        }, style: {
            marginLeft: 6,
            opacity: copied ? 1 : 0,
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 11,
            transition: 'opacity 0.15s',
        }, className: "json-copy-btn", children: copied ? 'copied' : 'copy' }));
}
function JsonNode({ data, depth, maxDepth, keyName, isIndex, }) {
    const [expanded, setExpanded] = useState(depth < 2);
    const [strExpanded, setStrExpanded] = useState(false);
    const isObj = data !== null && typeof data === 'object';
    const isArr = Array.isArray(data);
    const entries = isObj
        ? isArr
            ? data.map((v, i) => [i, v])
            : Object.entries(data)
        : [];
    const count = entries.length;
    const renderKey = () => {
        if (keyName === undefined)
            return null;
        const style = isIndex
            ? { color: colors.index, fontStyle: 'italic' }
            : { color: colors.key };
        return (_jsxs("span", { style: style, children: [isIndex ? keyName : `"${keyName}"`, _jsx("span", { style: { color: colors.brace }, children: ": " })] }));
    };
    if (data === null)
        return (_jsxs("div", { style: { paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }, className: "json-row", children: [renderKey(), _jsx("span", { style: { color: colors.null }, children: "null" }), _jsx(CopyBtn, { value: null })] }));
    if (typeof data === 'boolean')
        return (_jsxs("div", { style: { paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }, className: "json-row", children: [renderKey(), _jsx("span", { style: { color: colors.boolean }, children: String(data) }), _jsx(CopyBtn, { value: data })] }));
    if (typeof data === 'number')
        return (_jsxs("div", { style: { paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }, className: "json-row", children: [renderKey(), _jsx("span", { style: { color: colors.number }, children: data }), _jsx(CopyBtn, { value: data })] }));
    if (typeof data === 'string') {
        const long = data.length > 100 && !strExpanded;
        const display = long ? data.slice(0, 100) + '...' : data;
        return (_jsxs("div", { style: { paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }, className: "json-row", children: [renderKey(), _jsxs("span", { style: {
                        color: colors.string,
                        cursor: long || data.length > 100 ? 'pointer' : 'default',
                    }, onClick: () => data.length > 100 && setStrExpanded(!strExpanded), children: ["\"", display, "\""] }), _jsx(CopyBtn, { value: data })] }));
    }
    if (!isObj)
        return (_jsxs("div", { style: { paddingLeft: depth * 16 }, className: "json-row", children: [renderKey(), _jsx("span", { children: String(data) })] }));
    const open = isArr ? '[' : '{';
    const close = isArr ? ']' : '}';
    const summary = isArr ? `[...] ${count} items` : `{...} ${count} keys`;
    if (!expanded)
        return (_jsxs("div", { style: { paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }, className: "json-row", children: [_jsx("span", { style: { cursor: 'pointer', marginRight: 4, userSelect: 'none' }, onClick: () => setExpanded(true), children: "\u25B8" }), renderKey(), _jsx("span", { style: { color: colors.brace, cursor: 'pointer' }, onClick: () => setExpanded(true), children: summary }), _jsx(CopyBtn, { value: data })] }));
    return (_jsxs("div", { children: [_jsxs("div", { style: { paddingLeft: depth * 16, display: 'flex', alignItems: 'center' }, className: "json-row", children: [_jsx("span", { style: { cursor: 'pointer', marginRight: 4, userSelect: 'none' }, onClick: () => depth > 0 && setExpanded(false), children: "\u25BE" }), renderKey(), _jsx("span", { style: { color: colors.brace }, children: open }), _jsx(CopyBtn, { value: data })] }), entries.map(([k, v]) => (_jsx(JsonNode, { data: v, depth: depth + 1, maxDepth: maxDepth, keyName: k, isIndex: isArr }, String(k)))), _jsx("div", { style: { paddingLeft: depth * 16 }, children: _jsx("span", { style: { color: colors.brace }, children: close }) })] }));
}
export default function JsonViewer({ data, maxDepth = 3 }) {
    return (_jsxs("div", { style: {
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
            fontSize: 13,
            lineHeight: '20px',
            maxHeight: 400,
            overflowY: 'auto',
            padding: '8px 0',
            color: '#e5e5e5',
        }, children: [_jsx("style", { children: `.json-row:hover .json-copy-btn { opacity: 1 !important; }` }), _jsx(JsonNode, { data: data, depth: 0, maxDepth: maxDepth })] }));
}
