/**
 * Explicit injection token for the Kysely instance.
 *
 * Not the `Kysely` class itself: it is generic, and controllers import it as a
 * type-only import (erased at runtime), so class-token DI would resolve to
 * `Function` and fail. An explicit token also keeps the controllers honest —
 * they depend on "the database", not on Kysely's constructor identity.
 */
export const DATABASE = Symbol.for('copalibre.database');
