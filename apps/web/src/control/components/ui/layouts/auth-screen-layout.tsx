/**
 * Original composition — the templates tier's fourth shape: the unauthenticated
 * screens (login, forgot/reset password, invitation acceptance). Brand header,
 * one centered panel, and the page gutter that keeps that panel off the
 * viewport edge at every width.
 *
 * Lifted out of NativeAuthRoutes.tsx, where it lived as a local `AuthLayout`
 * that only three of the four auth screens could reach: the invitation screen
 * centred its own card in a bare <body> instead, which is why it alone ran
 * flush to both edges on mobile. Layout and spacing only — no data-fetching or
 * business logic (design.md Decisions 7-8).
 */
import type { ReactNode } from 'react';

export interface AuthScreenLayoutProps {
  /** Beneath the wordmark: what this installation is, not what the screen does. */
  readonly tagline: string;
  readonly children: ReactNode;
}

export function AuthScreenLayout({ tagline, children }: AuthScreenLayoutProps): React.JSX.Element {
  return (
    <main className="cl-auth-screen">
      <header className="cl-auth-screen__header">
        <img
          alt=""
          className="cl-auth-screen__mark"
          height="44"
          src="/copalibre-logo.svg"
          width="44"
        />
        <div className="cl-auth-screen__brand">
          <strong className="cl-auth-screen__wordmark">CopaLibre</strong>
          <span className="cl-auth-screen__tagline">{tagline}</span>
        </div>
      </header>
      <section className="cl-auth-screen__panel">{children}</section>
    </main>
  );
}
