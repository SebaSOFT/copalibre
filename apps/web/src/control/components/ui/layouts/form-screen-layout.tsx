/**
 * Original composition, the templates tier's second shape: header,
 * grouped form-field sections, sticky footer action bar. No data-fetching or
 * business logic lives in this file.
 */
import type { ReactNode } from 'react';
import { Form } from '../atoms/form.js';
import { PageHeader, type PageHeaderBreadcrumb } from '../organisms/page-header.js';

export interface FormScreenSection {
  readonly key: string;
  readonly heading?: ReactNode;
  readonly fields: ReactNode;
}

export interface FormScreenLayoutProps {
  readonly title: ReactNode | null;
  readonly breadcrumb?: ReactNode;
  readonly breadcrumbs?: readonly PageHeaderBreadcrumb[];
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly sections: readonly FormScreenSection[];
  readonly footer: ReactNode;
  readonly onSubmit?: (event: React.SyntheticEvent<HTMLFormElement>) => void;
}

export function FormScreenLayout({
  title,
  breadcrumb,
  breadcrumbs,
  description,
  actions,
  sections,
  footer,
  onSubmit,
}: FormScreenLayoutProps): React.JSX.Element {
  return (
    <Form className="cl-form-screen" onSubmit={onSubmit}>
      <PageHeader
        actions={actions}
        breadcrumbs={breadcrumbs}
        legacyBreadcrumb={breadcrumb}
        description={description}
        title={title}
        titleClassName="cl-form-screen__title"
      />
      {sections.map((section) => (
        <section className="cl-form-screen__section" key={section.key}>
          {section.heading ? (
            <h2 className="cl-form-screen__section-heading">{section.heading}</h2>
          ) : null}
          <div className="cl-form-screen__section-fields">{section.fields}</div>
        </section>
      ))}
      <footer className="cl-form-screen__footer">{footer}</footer>
    </Form>
  );
}
