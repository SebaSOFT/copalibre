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
  it('shows the organization emblem, escaped name and public page link in the header', () => {
    const { html } = renderEmail(config, content);
    expect(html).toContain('src="https://liga.example/organizations/liga-mendocina/emblem"');
    expect(html).toContain('alt="Liga &lt;Mendocina&gt; &amp; Co"');
    expect(html).toContain('href="https://liga.example/liga-mendocina"');
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

  it('shows the Copa Libre mark alone when there is no organization', () => {
    const { html, text } = renderEmail(config, { ...content, organization: undefined });
    expect(html).toContain('alt="Copa Libre" width="40"');
    expect(html).not.toContain('/emblem');
    expect(text.startsWith('Copa Libre\n')).toBe(true);
  });

  it('signs every email with the Copa Libre logo and a fixed copalibre.app link', () => {
    const { html, text } = renderEmail(config, content);
    expect(html).toContain('src="https://liga.example/copalibre-logo.png"');
    expect(html).toContain('href="https://copalibre.app"');
    expect(text.trimEnd().endsWith('https://copalibre.app')).toBe(true);
  });

  it('gives every image alternative text', () => {
    const { html } = renderEmail(config, content);
    const images = html.match(/<img [^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image).toMatch(/alt="[^"]+"/);
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
