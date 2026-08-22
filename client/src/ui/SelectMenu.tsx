import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectMenuOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  group?: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  ariaLabel,
  compact = false,
}: {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  function position() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const groupCount = new Set(options.map((option) => option.group).filter(Boolean)).size;
    const estimatedHeight = Math.min(520, options.length * 42 + groupCount * 28 + 12);
    const below = window.innerHeight - box.bottom;
    setRect({
      top: below >= estimatedHeight || below >= box.top ? box.bottom + 6 : Math.max(8, box.top - estimatedHeight - 6),
      left: Math.max(8, Math.min(box.left, window.innerWidth - Math.max(box.width, 240) - 8)),
      width: Math.max(box.width, 240),
    });
  }

  function show() {
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
    setActive(selectedIndex);
    position();
    setOpen(true);
  }

  function choose(option: SelectMenuOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function move(direction: -1 | 1) {
    if (!options.length) return;
    let index = active;
    for (let count = 0; count < options.length; count++) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) break;
    }
    setActive(index);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) show();
      const available = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
      setActive(event.key === 'Home' ? (available[0]?.index ?? 0) : (available.at(-1)?.index ?? 0));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) show();
      else if (options[active]) choose(options[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const close = () => setOpen(false);
    const closeOnOutsideScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', closeOnOutsideScroll, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', closeOnOutsideScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`select-menu-trigger${compact ? ' is-compact' : ''}${open ? ' is-open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? setOpen(false) : show()}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? '' : 'is-placeholder'}>{selected?.label ?? placeholder}</span>
        <ChevronDown />
      </button>
      {open && rect ? createPortal(
        <div ref={menuRef} className="select-menu-popover" role="listbox" aria-label={ariaLabel} style={rect}>
          {options.map((option, index) => (
            <div className="select-menu-option-wrap" key={option.value}>
            {option.group && option.group !== options[index - 1]?.group ? (
              <div className="select-menu-group-label">
                <span>{option.group}</span>
                <b>{options.filter((item) => item.group === option.group).length}</b>
              </div>
            ) : null}
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`select-menu-option${index === active ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span><b>{option.label}</b>{option.description ? <small>{option.description}</small> : null}</span>
              {option.value === value ? <Check /> : null}
            </button>
            </div>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
