/**
 * Who may hold a public connection open, and how many.
 *
 * A public SSE endpoint is a long-lived connection anybody can open without
 * credentials, which makes "how many at once" a question the server has to
 * answer rather than discover. Counted in memory per replica: the cap is about
 * this process's file descriptors, and a shared counter would add a round trip
 * to every connect to protect a resource that is not shared.
 *
 * ## Why a NAT is not an attacker
 *
 * A club streaming four screens from one venue arrives as four connections from
 * one address, and so does a scraper. The per-address cap is therefore generous
 * and the *global* cap is the real protection — and the venue surfaces in
 * public-display clients are told to use the authenticated device path precisely so a shared
 * address never decides whether the scoreboard works.
 */

export interface LimitPolicy {
  readonly perAddress: number;
  readonly perResource: number;
  readonly total: number;
}

export const DEFAULT_LIMITS: LimitPolicy = {
  perAddress: 8,
  perResource: 500,
  total: 2000,
};

export type Admission =
  | { readonly admitted: true; readonly release: () => void }
  | { readonly admitted: false; readonly reason: string };

export class ConnectionLimiter {
  private readonly byAddress = new Map<string, number>();
  private readonly byResource = new Map<string, number>();
  private open = 0;

  constructor(private readonly policy: LimitPolicy = DEFAULT_LIMITS) {}

  /**
   * Admits a connection, handing back the only way to give it up.
   *
   * A release function rather than a `remove(address)` call, because the caller
   * that has to remember which keys it incremented is the caller that leaks a
   * slot the first time a request path gains a branch.
   */
  admit(address: string, resource: string): Admission {
    if (this.open >= this.policy.total) {
      return { admitted: false, reason: 'this node is at its connection limit' };
    }
    if ((this.byAddress.get(address) ?? 0) >= this.policy.perAddress) {
      return { admitted: false, reason: 'too many connections from this address' };
    }
    if ((this.byResource.get(resource) ?? 0) >= this.policy.perResource) {
      return { admitted: false, reason: 'too many connections for this resource' };
    }

    this.open += 1;
    this.byAddress.set(address, (this.byAddress.get(address) ?? 0) + 1);
    this.byResource.set(resource, (this.byResource.get(resource) ?? 0) + 1);

    let released = false;
    return {
      admitted: true,
      release: () => {
        // Idempotent: a connection can end twice — once by the client, once by
        // the framework's cleanup — and a double decrement would hand out slots
        // that do not exist.
        if (released) return;
        released = true;
        this.open -= 1;
        decrement(this.byAddress, address);
        decrement(this.byResource, resource);
      },
    };
  }

  counts(): { readonly open: number; readonly addresses: number; readonly resources: number } {
    return { open: this.open, addresses: this.byAddress.size, resources: this.byResource.size };
  }
}

function decrement(counter: Map<string, number>, key: string): void {
  const next = (counter.get(key) ?? 1) - 1;
  // Deleted rather than left at zero, so an installation serving a season does
  // not accumulate a map entry per address it has ever seen.
  if (next <= 0) counter.delete(key);
  else counter.set(key, next);
}
