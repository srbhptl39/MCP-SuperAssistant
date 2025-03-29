import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@src/lib/utils';

interface ResizeHandleProps {
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  defaultWidth?: number;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onResize,
  minWidth = 280,
  maxWidth = 500,
  className,
  defaultWidth = 320,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(defaultWidth);
  const currentWidthRef = useRef<number>(defaultWidth);
  const rafRef = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    // Get the current sidebar width from the parent element's style
    const sidebarEl = handleRef.current?.parentElement;
    const currentWidth = sidebarEl ? parseInt(getComputedStyle(sidebarEl).width, 10) : defaultWidth;

    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    currentWidthRef.current = currentWidth;

    setIsDragging(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      // Cancel any pending animation frame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      // Use requestAnimationFrame for smoother updates
      rafRef.current = requestAnimationFrame(() => {
        const deltaX = startXRef.current - e.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + deltaX));

        // Only update if the width has changed by at least 1px
        if (Math.abs(newWidth - currentWidthRef.current) >= 1) {
          currentWidthRef.current = newWidth;

          // Apply width directly to the parent element for smoother resizing
          const sidebarEl = handleRef.current?.parentElement;
          if (sidebarEl) {
            sidebarEl.style.width = `${newWidth}px`;
            sidebarEl.style.transition = 'none'; // Disable transition during drag
          }

          // Call onResize callback
          onResize(newWidth);
        }
      });
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Re-enable transitions after drag ends
      const sidebarEl = handleRef.current?.parentElement;
      if (sidebarEl) {
        sidebarEl.style.transition = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minWidth, maxWidth, onResize]);

  return (
    <div
      ref={handleRef}
      className={cn(
        'absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize group',
        isDragging ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-400/30',
        className,
      )}
      onMouseDown={handleMouseDown}>
      <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1/2 h-16 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="h-10 w-1 rounded-full bg-blue-500/70 shadow-md"></div>
      </div>
    </div>
  );
};

export default ResizeHandle;
