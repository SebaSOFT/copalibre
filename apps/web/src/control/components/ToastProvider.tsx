import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import { errorPresentation, type ErrorDetails } from '../lib/error-messages.js';

export type ToastSeverity = 'success' | 'error' | 'info';

export interface ToastInput {
  readonly severity: ToastSeverity;
  readonly message: string;
  readonly details?: ErrorDetails;
}

export interface ToastApi {
  readonly push: (toast: ToastInput) => string;
  readonly pushError: (error: unknown) => string;
  readonly dismiss: (id: string) => void;
}

interface ToastRecord extends ToastInput {
  readonly id: string;
  readonly exiting: boolean;
}

/**
 * The organism tier's standing operation-feedback mechanism (0141,
 * control-web/admin-interface-components). A toast reports the result of a
 * completed/submitted operation ("invite sent", "save failed"); it is never
 * the right place for an in-progress field-validation problem — that is the
 * `ui/molecules/form-field.tsx` error slot's job (design.md Decision 6). No
 * screen should hand-build its own alert/toast pattern instead of `useToast()`.
 */
const AUTO_DISMISS_MS = 5_000;
const EXIT_FALLBACK_MS = 200;
const ToastContext = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const intl = useIntl();
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const sequence = useRef(0);
  const autoDismissTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string): void => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)),
    );
    if (exitTimers.current.has(id)) return;
    exitTimers.current.set(
      id,
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        exitTimers.current.delete(id);
      }, EXIT_FALLBACK_MS),
    );
  }, []);

  const push = useCallback((toast: ToastInput): string => {
    sequence.current += 1;
    const id = `control-toast-${sequence.current}`;
    setToasts((current) => [{ ...toast, id, exiting: false }, ...current]);
    return id;
  }, []);

  const pushError = useCallback(
    (error: unknown): string => push({ severity: 'error', ...errorPresentation(intl, error) }),
    [intl, push],
  );

  useEffect(() => {
    const activeIds = new Set(toasts.map((toast) => toast.id));
    for (const [id, timer] of autoDismissTimers.current) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        autoDismissTimers.current.delete(id);
      }
    }
    for (const toast of toasts) {
      if (
        toast.severity !== 'error' &&
        !toast.exiting &&
        !autoDismissTimers.current.has(toast.id)
      ) {
        autoDismissTimers.current.set(
          toast.id,
          setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS),
        );
      }
    }
  }, [dismiss, toasts]);

  useEffect(
    () => () => {
      for (const timer of autoDismissTimers.current.values()) clearTimeout(timer);
      for (const timer of exitTimers.current.values()) clearTimeout(timer);
    },
    [],
  );

  const api = useMemo(() => ({ push, pushError, dismiss }), [dismiss, push, pushError]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <style>{toastStyles}</style>
      <section
        aria-label={intl.formatMessage(messages.toastNotifications)}
        aria-live="polite"
        className="cl-toast-region"
      >
        {toasts.map((toast) => (
          <article
            className="cl-toast"
            data-exiting={toast.exiting || undefined}
            data-severity={toast.severity}
            key={toast.id}
            role={toast.severity === 'error' ? 'alert' : 'status'}
          >
            <div className="cl-toast__body">
              <strong className="cl-toast__severity">{severityLabel(intl, toast.severity)}</strong>
              <p className="cl-toast__message">{toast.message}</p>
              {toast.details && (
                <details className="cl-toast__details">
                  <summary>{intl.formatMessage(messages.toastDetails)}</summary>
                  {toast.details.errorCode && <code>{toast.details.errorCode}</code>}
                  <span>{toast.details.message}</span>
                </details>
              )}
            </div>
            <button
              aria-label={intl.formatMessage(messages.toastDismiss)}
              className="cl-focusable cl-toast__dismiss"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              ×
            </button>
          </article>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within ToastProvider');
  return value;
}

function severityLabel(intl: ReturnType<typeof useIntl>, severity: ToastSeverity): string {
  switch (severity) {
    case 'success':
      return `✓ ${intl.formatMessage(messages.toastSeveritySuccess)}`;
    case 'error':
      return `! ${intl.formatMessage(messages.toastSeverityError)}`;
    case 'info':
      return `i ${intl.formatMessage(messages.toastSeverityInfo)}`;
  }
}

const toastStyles = `
  .cl-toast-region {
    position: fixed;
    z-index: 1000;
    inset-block-start: var(--cl-space-4);
    inset-inline-end: var(--cl-space-4);
    display: grid;
    gap: var(--cl-space-3);
    width: min(calc(100vw - (2 * var(--cl-space-4))), var(--cl-breakpoint-sm));
    pointer-events: none;
  }
  .cl-toast {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cl-space-3);
    padding: var(--cl-space-4);
    border: 1px solid var(--cl-border-strong);
    background: var(--cl-surface-raised);
    color: var(--cl-text-primary);
    box-shadow: 0 12px 28px color-mix(in srgb, var(--cl-surface-base) 70%, transparent);
    pointer-events: auto;
    animation: cl-toast-enter var(--cl-motion-base) var(--cl-motion-easing);
    transition:
      opacity var(--cl-motion-base) var(--cl-motion-easing),
      transform var(--cl-motion-base) var(--cl-motion-easing);
  }
  .cl-toast[data-severity='success'] { border-color: var(--cl-state-positive); }
  .cl-toast[data-severity='error'] { border-color: var(--cl-state-negative); }
  .cl-toast[data-severity='info'] { border-color: var(--cl-state-live); }
  .cl-toast[data-exiting='true'] { opacity: 0; transform: translateX(var(--cl-space-4)); }
  .cl-toast__body { display: grid; min-width: 0; gap: var(--cl-space-2); }
  .cl-toast__severity {
    font-family: var(--cl-font-mono);
    font-size: var(--cl-font-size-xs);
    text-transform: uppercase;
  }
  .cl-toast__message { margin: 0; font-size: var(--cl-font-size-sm); }
  .cl-toast__details { color: var(--cl-text-secondary); font-size: var(--cl-font-size-xs); }
  .cl-toast__details summary { cursor: pointer; }
  .cl-toast__details code, .cl-toast__details span { display: block; margin-block-start: var(--cl-space-1); }
  .cl-toast__dismiss {
    display: grid;
    flex: 0 0 var(--cl-touch-target);
    width: var(--cl-touch-target);
    min-height: var(--cl-touch-target);
    place-items: center;
    border: 1px solid var(--cl-border-muted);
    background: transparent;
    color: var(--cl-text-primary);
    cursor: pointer;
    font-size: var(--cl-font-size-lg);
  }
  @keyframes cl-toast-enter {
    from { opacity: 0; transform: translateX(var(--cl-space-4)); }
    to { opacity: 1; transform: translateX(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .cl-toast { animation-duration: 0s; transition-duration: 0s; }
  }
`;
