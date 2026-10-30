import { WizardShell } from '../ui/organisms/wizard-shell.js';
import type { WizardShellProps } from '../ui/organisms/wizard-shell.js';

export type WizardTemplateProps = WizardShellProps;

export function WizardTemplate(props: WizardTemplateProps): React.JSX.Element {
  return (
    <div className="cl-wizard-template">
      <WizardShell {...props} />
    </div>
  );
}
