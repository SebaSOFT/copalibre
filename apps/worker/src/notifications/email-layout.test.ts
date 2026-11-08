import type { EmailDeliveryConfig } from '../invitations/email-delivery.js';
import { escapeHtml, renderEmail, type EmailContent } from './email-layout.js';

const config: EmailDeliveryConfig = {
  provider: 'smtp',
  appUrl: 'https://liga.example',
  from: 'noreply@liga.example',
  smtpUrl: 'smtp://localhost:1025',
};

const content: EmailContent = {
  to: 'admin@liga.example',
  subject: 'Subject',
  language: 'en',
  organization: { alias: 'liga-mendocina', name: 'Liga <Mendocina> & Co', hasEmblem: true },
  heading: 'Heading',
  paragraphs: ['First paragraph', 'Second <b>paragraph</b>'],
  action: { label: 'Open', url: 'https://liga.example/control/liga-mendocina/clubs' },
};

describe('email layout', () => {
  it('uses script-aware body and display font stacks', () => {
    const { html } = renderEmail(config, content);

    expect(html).toContain(
      "font-family:'Barlow', 'Roboto', 'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', sans-serif;",
    );
    expect(html).toContain(
      "font-family:'Barlow Condensed', 'Roboto Condensed', 'Noto Sans SC', 'Arial Narrow', system-ui, sans-serif;",
    );
  });

  it('shows the organization emblem, escaped name and public page link in the header', () => {
    const { html } = renderEmail(config, content);
    expect(html).toContain('src="https://liga.example/api/organizations/liga-mendocina/emblem"');
    expect(html).toContain('>Liga &lt;Mendocina&gt; &amp; Co</span>');
    expect(html).toContain('href="https://liga.example/liga-mendocina"');
  });

  it('names the organization and the product once each where images are blocked', () => {
    const { html } = renderEmail(config, content);
    const readable = html.replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, '$1').replace(/<[^>]+>/g, ' ');
    expect(readable.match(/Liga &lt;Mendocina&gt; &amp; Co/g)).toHaveLength(1);
    expect(readable.match(/CopaLibre/g)).toHaveLength(1);
  });

  it('routes the organization link under the language prefix for non-English languages', () => {
    const { html } = renderEmail(config, { ...content, language: 'es' });
    expect(html).toContain('href="https://liga.example/es/liga-mendocina"');
    expect(html).toContain('<html lang="es">');
  });

  it('shows the name alone, with no image, when the organization has no emblem', () => {
    const { html } = renderEmail(config, {
      ...content,
      organization: { alias: 'liga-mendocina', name: 'Liga', hasEmblem: false },
    });
    expect(html).not.toContain('/emblem');
    expect(html).toContain('>Liga</span>');
  });

  it('shows the CopaLibre mark alone when there is no organization', () => {
    const { html, text } = renderEmail(config, { ...content, organization: undefined });
    expect(html).toContain('alt="CopaLibre" width="40"');
    expect(html).not.toContain('/emblem');
    expect(text.startsWith('CopaLibre\n')).toBe(true);
  });

  it('signs every email with the CopaLibre logo and a fixed www.copalibre.app link', () => {
    const { html, text } = renderEmail(config, content);
    expect(html).toContain('src="https://liga.example/copalibre-logo.png"');
    expect(html).toContain('href="https://www.copalibre.app"');
    expect(text.trimEnd().endsWith('https://www.copalibre.app')).toBe(true);
  });

  it('shows the canonical host as the signature link text, so following it needs no redirect', () => {
    const { html } = renderEmail(config, content);
    expect(html).toContain(
      'href="https://www.copalibre.app" style="color:#5b6b7a;">www.copalibre.app</a>',
    );
    expect(html).not.toContain('https://copalibre.app');
    expect(html).not.toContain('>copalibre.app<');
  });

  it('gives every image an alt attribute, empty when its name sits beside it', () => {
    const { html } = renderEmail(config, content);
    const images = html.match(/<img [^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image).toMatch(/alt="[^"]*"/);
  });

  it('escapes body text and always carries a plain-text part with the action link', () => {
    const { html, text } = renderEmail(config, content);
    expect(html).toContain('Second &lt;b&gt;paragraph&lt;/b&gt;');
    expect(html).not.toContain('<b>paragraph</b>');
    expect(text).toContain('Open: https://liga.example/control/liga-mendocina/clubs');
  });

  it('omits the action when none is given', () => {
    const { html, text } = renderEmail(config, { ...content, action: undefined });
    expect(html).not.toContain('display:inline-block');
    expect(text).not.toContain('Open:');
  });

  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
