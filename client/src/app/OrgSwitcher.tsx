import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Cloud } from 'lucide-react';
import { useAppState } from './state';
import { orgIdOf, type Org } from '../types';

/**
 * Replaces a hidden native <select> that used to sit invisibly over this card. A native
 * select renders as an unstyled OS-level popup with no relation to the app's design — it
 * can't show the sandbox/production context per org, and it can't even be screenshotted in
 * headless Chrome, which is a good sign of how disconnected it is from the page. This is a
 * real menu instead, portaled to the body and positioned from the trigger's on-screen
 * coordinates so it can't be clipped by the sidebar's scrolling container (the same fix the
 * collapsed-nav tooltips needed).
 *
 * A side benefit: with no native <select> in the DOM, the browser has nothing to "restore" a
 * stale value into across a reload, so the class of bug that caused the org to silently
 * switch on refresh can't recur here.
 */
export function OrgSwitcher() {
  const { org, orgId, orgs, selectOrg } = useAppState();
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Org usernames run long (full email addresses); a wider menu than the trigger keeps
    // more of them readable without truncating, especially in the narrow collapsed rail.
    const width = Math.min(Math.max(rect.width, 300), window.innerWidth - rect.left - 16);
    setMenuRect({ top: rect.bottom + 6, left: rect.left, width });
    setActiveIndex(Math.max(0, orgs.findIndex((candidate) => orgIdOf(candidate) === orgId)));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  function choose(candidate: Org) {
    setOpen(false);
    if (orgIdOf(candidate) !== orgId) void selectOrg(candidate);
  }

  // Focus never leaves the trigger button, so one handler covers opening the menu and
  // navigating it — simpler than moving focus into the portal and shuttling it back.
  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % orgs.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + orgs.length) % orgs.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (orgs[activeIndex]) choose(orgs[activeIndex]);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="org-switch"
        title={`${orgId} · ${org.username}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="nav-tile">
          <Cloud />
        </span>
        <div className="org-switch-text">
          <b>{orgId}</b>
          <small>
            <i className="dot dot-success" /> {org.isSandbox ? 'Sandbox' : 'Production'}
          </small>
        </div>
        <ChevronsUpDown className="org-switch-caret" />
      </button>

      {open && menuRect
        ? createPortal(
            <div
              ref={menuRef}
              className="org-menu"
              role="listbox"
              aria-label="Switch active org"
              style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
            >
              {orgs.map((candidate, index) => {
                const id = orgIdOf(candidate);
                const active = id === orgId;
                return (
                  <button
                    key={candidate.username}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`org-menu-item${index === activeIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(candidate)}
                  >
                    <span className="org-menu-item-text">
                      <b>{id}</b>
                      <small>
                        {candidate.isSandbox ? 'Sandbox' : 'Production'} · {candidate.username}
                      </small>
                    </span>
                    {active ? <Check /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
