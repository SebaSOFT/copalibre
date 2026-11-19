import type { ClientDirective } from 'astro';
import { afterNextPaint } from '../lib/deferred-stylesheets.ts';

/**
 * `client:after-paint`: hydrates an island once the page has painted and the browser is idle.
 *
 * For islands that only enhance what the server already rendered (a popover over a venue pill, an
 * entrant name that abbreviates when it overflows). Under `client:load` their framework code is
 * requested while the page is still parsing, so on a slow phone it shares the connection with the
 * stylesheet and fonts the first paint waits for, and the tournament page's heading painted later.
 */
const afterPaint: ClientDirective = (load) => {
  const hydrate = (): void => {
    void load().then((run) => run());
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => afterNextPaint(hydrate), { once: true });
  } else {
    afterNextPaint(hydrate);
  }
};

export default afterPaint;
