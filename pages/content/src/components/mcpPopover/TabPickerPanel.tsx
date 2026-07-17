import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TabPicker, { type TabPickerTheme } from './TabPicker';

interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface TabPickerPanelProps {
  theme: TabPickerTheme;
  anchorRect: Rect;
  /** Live rect while the trigger is connected, frozen anchor rect once it unmounts. */
  getAnchorRect: () => Rect;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

const PANEL_WIDTH = 360;
const MARGIN = 8;
const GAP = 8;

interface Position {
  left: number;
  top?: number;
  bottom?: number;
  up: boolean;
  maxHeight: number;
}

// Right-preferred flyout that grows upward near the bottom of the viewport. Pure
// function of a rect + current viewport; fully clamped, no post-render measurement.
const computePosition = (rect: Rect): Position => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxHeight = Math.min(440, vh - 2 * MARGIN);

  let left = rect.right + GAP;
  if (left + PANEL_WIDTH > vw - MARGIN) {
    left = rect.left - GAP - PANEL_WIDTH; // flip left
    if (left < MARGIN) {
      left = Math.max(MARGIN, Math.min(vw - PANEL_WIDTH - MARGIN, rect.right + GAP)); // clamp
    }
  }

  if (rect.top > vh / 2) {
    // Trigger in the lower half (the normal case): anchor by bottom, grow up.
    return { left, bottom: Math.max(MARGIN, vh - rect.bottom), up: true, maxHeight };
  }
  return { left, top: Math.max(MARGIN, rect.top), up: false, maxHeight };
};

const TabPickerPanel: React.FC<TabPickerPanelProps> = ({
  theme,
  anchorRect,
  getAnchorRect,
  onClose,
  onPointerEnter,
  onPointerLeave,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position>(() => computePosition(anchorRect));

  useLayoutEffect(() => {
    setPos(computePosition(getAnchorRect()));
  }, [getAnchorRect]);

  // Keep aligned while open.
  useEffect(() => {
    const reposition = () => setPos(computePosition(getAnchorRect()));
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [getAnchorRect]);

  // Esc closes (capture phase, swallow so site UI doesn't also react).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  // Outside mousedown closes; ignore clicks inside the panel or on a Tabs trigger
  // (its own onClick toggle owns that path). Delayed like the popover handler so the
  // opening click doesn't immediately close it.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if ((e.target as Element)?.closest?.('[data-mcp-tabs-trigger]')) return;
      onClose();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 10);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      id="mcp-tab-flyout"
      ref={panelRef}
      role="dialog"
      aria-label="Attach tabs"
      className={`mcp-tab-flyout mcp-tab-flyout--${pos.up ? 'up' : 'down'}`}
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}>
      <TabPicker theme={theme} onDone={onClose} flyout />
    </div>,
    document.body,
  );
};

export default TabPickerPanel;
// ponytail: no focus trap; hover-opened panel deliberately doesn't steal chat-input focus.
// Add roving focus only if an a11y audit demands it — Esc + real-button triggers cover keyboard.
