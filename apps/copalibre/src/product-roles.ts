export const PRODUCT_ROLES = [
  'api',
  'events',
  'worker',
  'scheduler',
  'migrate',
  'doctor',
  'upgrade-check',
  'create-admin',
  'web',
] as const;

export type ProductRole = (typeof PRODUCT_ROLES)[number];

export type ProductRoleResolution =
  | {
      readonly ok: true;
      readonly role: ProductRole;
      readonly source: 'argument' | 'environment';
      readonly roleArguments: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

/**
 * Resolves the first container argument before PRODUCT_ROLE. A concrete command
 * always wins so an operator can override a Compose default while debugging.
 */
export function resolveProductRole(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): ProductRoleResolution {
  const firstArgument = arguments_[0];
  if (firstArgument && isProductRole(firstArgument)) {
    return {
      ok: true,
      role: firstArgument,
      source: 'argument',
      roleArguments: arguments_.slice(1),
    };
  }

  const environmentRole = environment.PRODUCT_ROLE;
  if (environmentRole && isProductRole(environmentRole)) {
    return { ok: true, role: environmentRole, source: 'environment', roleArguments: arguments_ };
  }
  if (!firstArgument && !environmentRole) {
    return {
      ok: false,
      message: `A product role is required. Set PRODUCT_ROLE or pass one of: ${PRODUCT_ROLES.join(', ')}`,
    };
  }
  return {
    ok: false,
    message: `Unrecognized product role "${firstArgument ?? environmentRole}". Expected one of: ${PRODUCT_ROLES.join(', ')}`,
  };
}

export function isProductRole(value: string): value is ProductRole {
  return (PRODUCT_ROLES as readonly string[]).includes(value);
}
