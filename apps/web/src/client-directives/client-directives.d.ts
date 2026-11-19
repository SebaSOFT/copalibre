import 'astro';

declare module 'astro' {
  interface AstroClientDirectives {
    /** Hydrates after the first paint, when the browser is idle: `after-paint.ts`. */
    'client:after-paint'?: boolean;
  }
}
