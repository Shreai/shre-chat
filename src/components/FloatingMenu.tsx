import { createPortal } from 'react-dom';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

type Alignment = 'start' | 'end';
type Placement = 'bottom' | 'top';

export interface FloatingMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  width?: number;
  minWidth?: number;
  maxHeight?: number;
  alignment?: Alignment;
  placement?: Placement;
  offset?: number;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function FloatingMenu({
  open,
  onClose,
  anchorRef,
  children,
  width = 224,
  minWidth,
  maxHeight = 420,
  alignment = 'start',
  placement = 'bottom',
  offset = 8,
  zIndex = 200,
  className,
  style,
}: FloatingMenuProps) {
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const updatePosition = useMemo(
    () => () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const preferredWidth = minWidth ?? width;
      const leftCandidate = alignment === 'end' ? rect.right - preferredWidth : rect.left;
      const left = clamp(
        leftCandidate,
        margin,
        Math.max(margin, viewportWidth - preferredWidth - margin),
      );
      const spaceBelow = viewportHeight - rect.bottom - margin - offset;
      const spaceAbove = rect.top - margin - offset;
      const placeBelow =
        placement === 'bottom'
          ? spaceBelow >= Math.min(maxHeight, 180) || spaceBelow >= spaceAbove
          : false;
      const useBottom = placement === 'bottom' ? placeBelow : false;
      const available = useBottom ? spaceBelow : spaceAbove;
      const clampedHeight = Math.max(120, Math.min(maxHeight, available));

      setMenuStyle({
        position: 'fixed',
        left,
        width: preferredWidth,
        minWidth,
        maxHeight: clampedHeight,
        overflowY: 'auto',
        zIndex,
        top: useBottom ? rect.bottom + offset : undefined,
        bottom: useBottom ? undefined : viewportHeight - rect.top + offset,
      });
    },
    [alignment, anchorRef, maxHeight, minWidth, offset, placement, width, zIndex],
  );

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePosition();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    window.visualViewport?.addEventListener('resize', onMove);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      window.visualViewport?.removeEventListener('resize', onMove);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, updatePosition]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[199]" onClick={onClose} />
      <div
        className={className}
        style={{
          ...menuStyle,
          ...style,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
