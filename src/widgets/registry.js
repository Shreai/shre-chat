const CHAT_WIDGETS = new Map();
export function registerChatWidget(w) {
    CHAT_WIDGETS.set(w.id, w);
}
export function getChatWidgets() {
    return Array.from(CHAT_WIDGETS.values());
}
export function getEnabledWidgets() {
    try {
        const hidden = JSON.parse(localStorage.getItem('shre-chat.hidden-widgets') || '[]');
        return getChatWidgets().filter((w) => !hidden.includes(w.id));
    }
    catch {
        return getChatWidgets();
    }
}
// Register default widgets
registerChatWidget({
    id: 'active-agents',
    name: 'Active Agents',
    icon: 'Zap',
    defaultEnabled: true,
    component: () => import('./panels/ActiveAgentsPanel'),
});
registerChatWidget({
    id: 'recent-tasks',
    name: 'Recent Tasks',
    icon: 'CheckSquare',
    defaultEnabled: true,
    component: () => import('./panels/RecentTasksPanel'),
});
registerChatWidget({
    id: 'model-info',
    name: 'Model & Cost',
    icon: 'Brain',
    defaultEnabled: true,
    component: () => import('./panels/ModelInfoPanel'),
});
registerChatWidget({
    id: 'quick-actions',
    name: 'Quick Actions',
    icon: 'Sparkles',
    defaultEnabled: true,
    component: () => import('./panels/QuickActionsPanel'),
});
