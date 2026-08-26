/**
 * Original composition, the templates tier's second shape: header,
 * grouped form-field sections, sticky footer action bar. No data-fetching or
 * business logic lives in this file (design.md Decisions 7-8).
 */
import type { ReactNode } from 'react';

export interface FormScreenSection {
  readonly key: string;
  readonly heading?: ReactNode;
  readonly fields: ReactNode;
}

export interface FormScreenTemplateProps {
  readonly title: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly sections: readonly FormScreenSection[];
  readonly footer: ReactNode;
  readonly onSubmit?: (event: React.FormEvent) => void;
}

export function FormScreenTemplate({
  title,
  breadcrumb,
  sections,
  footer,
  onSubmit,
}: FormScreenTemplateProps): React.JSX.Element {
  return (
    <form className="cl-form-screen" onSubmit={onSubmit}>
      <header className="cl-form-screen__header">
        {breadcrumb ? <div className="cl-form-screen__breadcrumb">{breadcrumb}</div> : null}
        <h1 className="cl-form-screen__title">{title}</h1>
      </header>
      {sections.map((section) => (
        <section className="cl-form-screen__section" key={section.key}>
          {section.heading ? (
            <h2 className="cl-form-screen__section-heading">{section.heading}</h2>
          ) : null}
          <div className="cl-form-screen__section-fields">{section.fields}</div>
        </section>
      ))}
      <footer className="cl-form-screen__footer">{footer}</footer>
    </form>
  );
}
