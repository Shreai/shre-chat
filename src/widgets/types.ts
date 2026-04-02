import type { ComponentType } from 'react';

export type ChatWidgetSize = 'compact' | 'expanded';

export interface ChatWidget {
  id: string;
  name: string;
  icon: string; // lucide icon name
  defaultEnabled: boolean;
  component: () => Promise<{ default: ComponentType<ChatWidgetProps> }>;
}

export interface ChatWidgetProps {
  size: ChatWidgetSize;
}
