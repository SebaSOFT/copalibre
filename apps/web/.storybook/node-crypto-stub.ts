/**
 * Stub for Storybook client-side bundle where Node's built-in `node:crypto`
 * is referenced by shared domain packages.
 */
export function createHash(): { update: () => unknown; digest: () => string } {
  return {
    update() {
      return this;
    },
    digest() {
      return '';
    },
  };
}

export default {
  createHash,
};
