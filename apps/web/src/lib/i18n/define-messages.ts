import { defineMessages as formatjsDefineMessages, type MessageDescriptor } from 'react-intl';

/**
 * Keeps the catalog contract compatible across react-intl 10 and 12. The
 * application formats descriptors dynamically, so placeholder typing belongs
 * at each formatMessage call rather than in the catalog's inferred type.
 */
export function defineMessages<const T extends Record<string, MessageDescriptor>>(
  messages: T,
): { [Key in keyof T]: MessageDescriptor } {
  return formatjsDefineMessages(messages) as { [Key in keyof T]: MessageDescriptor };
}
