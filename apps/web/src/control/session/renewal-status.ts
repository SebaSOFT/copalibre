export const SESSION_RENEWING_STATUS_EVENT = 'copalibre:session-renewing-status';

export function setSessionReconnecting(reconnecting: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SESSION_RENEWING_STATUS_EVENT, { detail: { reconnecting } }),
  );
}
