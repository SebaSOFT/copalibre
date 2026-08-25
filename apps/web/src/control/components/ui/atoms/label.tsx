/**
 * Copied from shadcn/ui 2.3.0 (MIT), built on Radix Label, and rewritten onto
 * CopaLibre's tokens. See THIRD_PARTY_NOTICES.md.
 */
import * as RadixLabel from '@radix-ui/react-label';

export type LabelProps = RadixLabel.LabelProps;

export function Label({ className = '', ...rest }: LabelProps): React.JSX.Element {
  return <RadixLabel.Root className={`cl-label ${className}`} {...rest} />;
}
