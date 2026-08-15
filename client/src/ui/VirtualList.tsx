import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fixed-height windowing for the long lists this application produces — a metadata type can
 * hold thousands of components, and rendering every checkbox made search feel frozen.
 * Below `threshold` items everything renders normally, so short lists keep native behaviour.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  overscan = 8,
  threshold = 60,
  className = '',
  emptyState,
}: {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  threshold?: number;
  className?: string;
  emptyState?: ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  // A new list (a different type expanded, or a new search) starts from the top.
  useEffect(() => {
    setScrollTop(0);
    if (container.current) container.current.scrollTop = 0;
  }, [items]);

  if (!items.length) return <div className={className}>{emptyState}</div>;

  if (items.length <= threshold) {
    return (
      <div className={className} style={{ maxHeight: height, overflowY: 'auto' }}>
        {items.map(renderItem)}
      </div>
    );
  }

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(items.length, start + Math.ceil(height / itemHeight) + overscan * 2);

  return (
    <div
      ref={container}
      className={className}
      style={{ height, overflowY: 'auto' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${start * itemHeight}px)` }}>
          {items.slice(start, end).map((item, index) => renderItem(item, start + index))}
        </div>
      </div>
    </div>
  );
}
