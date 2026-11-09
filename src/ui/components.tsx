import React, {
  useId,
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
export type IconName =
  | 'grid'
  | 'people'
  | 'activity'
  | 'shield'
  | 'arrow'
  | 'check'
  | 'copy'
  | 'search'
  | 'filter'
  | 'download'
  | 'plus'
  | 'close'
  | 'chevron'
  | 'refresh'
  | 'logout'
  | 'lock'
  | 'clock'
  | 'file'
  | 'burn'
  | 'more'
  | 'menu'
  | 'info'
  | 'alert'
  | 'upload'
  | 'mail'
  | 'eye'
  | 'sort';
const paths: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 4v2" />
    </>
  ),
  activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M15 8V3H3v13h5" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
    </>
  ),
  logout: <path d="M9 4H4v16h5m4-12 5 4-5 4m-5-4h10" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  file: (
    <>
      <path d="M13 3H5v18h14V9zm0 0v6h6M8 14h8m-8 4h5" />
    </>
  ),
  burn: (
    <path d="M13 3c2 5-2 6 0 9 1-1 3-2 4-4 5 6 2 13-5 13-6 0-10-5-6-11 0 3 1 4 2 4-1-5 4-7 5-11Z" />
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2Zm0 6v5m0 3v1" />
    </>
  ),
  upload: <path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  sort: <path d="m8 3-4 4m4-4 4 4M8 3v18m8 0-4-4m4 4 4-4m-4 4V3" />,
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Help({
  text,
  children,
}: {
  text: string;
  children?: React.ReactNode;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 8 }),
    host = useRef<HTMLSpanElement>(null),
    tip = useRef<HTMLSpanElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function show() {
    clearTimeout(timer.current);
    setOpen(true);
  }
  function hide() {
    clearTimeout(timer.current);
    setOpen(false);
  }
  useLayoutEffect(() => {
    if (!open || !host.current || !tip.current) return;
    const anchor = children ? host.current : host.current.querySelector('button');
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect(),
      bounds = tip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(
          rect.left + (rect.width - bounds.width) / 2,
          window.innerWidth - bounds.width - 8,
        ),
      ),
      top: Math.max(
        8,
        rect.top - bounds.height - 9 < 8
          ? Math.min(rect.bottom + 9, window.innerHeight - bounds.height - 8)
          : rect.top - bounds.height - 9,
      ),
    });
  }, [open, text, Boolean(children)]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      clearTimeout(timer.current);
    };
  }, [open]);
  return (
    <span
      ref={host}
      className={children ? "help" : "help help-standalone"}
      onMouseEnter={show}
      onMouseLeave={() => {
        timer.current = setTimeout(() => setOpen(false), 150);
      }}
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) hide();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {children && <span className="help-target">
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<any>, {
              'aria-describedby': open ? id : undefined,
            })
          : children}
      </span>}
      <button
        type="button"
        className="help-touch"
        aria-label={`Help: ${text}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={show}
      >
        <Icon name="info" size={13} />
      </button>
      {open && createPortal(
        <span
          ref={tip}
          id={id}
          role="tooltip"
          className="tooltip"
          style={position}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {text}
        </span>,
        host.current?.closest('dialog') ?? document.body,
      )}
    </span>
  );
}
export function Button({
  children,
  icon,
  onClick,
  disabled = false,
  busy = false,
  kind = 'secondary',
  title,
  type = 'button',
  className = '',
}: {
  children?: React.ReactNode;
  icon?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  kind?: string;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const button = (
    <button
      type={type}
      className={`btn ${kind} ${className}`}
      disabled={disabled || busy}
      onClick={onClick}
      aria-busy={busy || undefined}
      aria-label={!children ? title : undefined}
    >
      {busy ? <span className="spinner" /> : icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
  return title ? <Help text={title}>{button}</Help> : button;
}
export function Badge({ value }: { value: string }) {
  const label = human(value);
  return (
    <Help text={statusHelp[value] || label}>
      <span
        className={`badge ${['submitted', 'active', 'confirmed', 'disposed'].includes(value) ? 'positive' : ['revoked', 'removed', 'expired', 'correction_requested', 'invalid'].includes(value) ? 'warning' : ''}`}
      >
        <i />
        {label}
      </span>
    </Help>
  );
}
const statusHelp: Record<string, string> = {
  active: 'Invitation is approved and currently available.',
  pending: 'No accepted submission is recorded.',
  submitted: 'The backend accepted one encrypted synthetic submission.',
  not_started: 'No completed event has been recorded for this step.',
  not_recorded: 'This historical detail was not recorded.',
  revoked: 'Portal functions are blocked for this invitation.',
  removed: 'Access was removed; the permanent submission slot is preserved.',
  correction_requested: 'Access is revoked while a correction is reviewed.',
  expired: 'The invitation passed its server-side expiration.',
};
export const human = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace('google.com', 'Google')
    .replace('microsoft.com', 'Microsoft')
    .replace(/^./, (s) => s.toUpperCase());
export const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-CA', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Not recorded';
export const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-CA', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not recorded';
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    [closing, setClosing] = useState(false),
    closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function dismiss() {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 130);
  }
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !d) return;
      const nodes = [
        ...d.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    d?.addEventListener('keydown', fn);
    return () => {
      d?.removeEventListener('keydown', fn);
      d?.close();
      clearTimeout(closeTimer.current);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''} ${closing ? 'closing' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <div className="modal-head">
        <h2 id={id}>{title}</h2>
        <Button icon="close" title="Close this dialog" onClick={dismiss} />
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="search" size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Skeleton() {
  return (
    <div
      aria-label="Loading dashboard"
      role="status"
      className="skeleton-layout"
    >
      <div className="skeleton-heading" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
