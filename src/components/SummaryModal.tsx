import React from 'react';
import {
  SDialog,
  SDialogContent,
  SDialogHeader,
  SDialogTitle,
  SDialogFooter,
  SButton,
  SSeparator,
} from '@shre/ui-kit';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summaryText: string;
  onCopy: () => void;
}

export function SummaryModal({ isOpen, onClose, summaryText, onCopy }: SummaryModalProps) {
  return (
    <SDialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <SDialogContent className="max-w-lg">
        <SDialogHeader>
          <SDialogTitle className="flex items-center gap-2 text-sm">
            <svg
              className="h-4 w-4"
              style={{ color: 'var(--color-primary, var(--c-accent))' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Conversation Summary
          </SDialogTitle>
        </SDialogHeader>
        <SSeparator />
        <div className="max-h-[60vh] overflow-y-auto py-2">
          <div
            className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed"
            style={{ color: 'var(--color-text-secondary, var(--c-text-2))' }}
          >
            {summaryText.split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={i} />;
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <p key={i} className="my-1 pl-3" style={{ textIndent: '-0.75rem' }}>
                    {trimmed}
                  </p>
                );
              }
              if (trimmed.startsWith('**') || trimmed.startsWith('##')) {
                return (
                  <p
                    key={i}
                    className="font-semibold mt-3 mb-1"
                    style={{ color: 'var(--color-text, var(--c-text-1))' }}
                  >
                    {trimmed.replace(/^[#*\s]+/, '').replace(/\*+$/, '')}
                  </p>
                );
              }
              return (
                <p key={i} className="my-1">
                  {trimmed}
                </p>
              );
            })}
          </div>
        </div>
        <SSeparator />
        <SDialogFooter>
          <SButton variant="secondary" size="sm" onClick={onCopy}>
            Copy
          </SButton>
          <SButton size="sm" onClick={onClose}>
            Close
          </SButton>
        </SDialogFooter>
      </SDialogContent>
    </SDialog>
  );
}
