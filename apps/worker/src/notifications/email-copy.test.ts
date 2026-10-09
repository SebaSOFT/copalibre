import { SUPPORTED_LANGUAGES } from '@copalibre/domain';
import { emailCopy } from './email-copy.js';

describe('email copy', () => {
  it.each(SUPPORTED_LANGUAGES)('has every string, non-empty, in %s', (language) => {
    const copy = emailCopy(language);
    const strings = [
      copy.sentBy,
      copy.tournamentCreated.subject('T'),
      copy.tournamentCreated.heading,
      copy.tournamentCreated.body('T'),
      copy.tournamentCreated.action,
      copy.clubCreated.subject('C'),
      copy.clubCreated.heading,
      copy.clubCreated.body('C'),
      copy.clubCreated.action,
      copy.entrantRegistered.subject('E', 'T'),
      copy.entrantRegistered.heading,
      copy.entrantRegistered.body('E', 'T'),
      copy.entrantRegistered.action,
      copy.squadSubmitted.subject('E', 'T'),
      copy.squadSubmitted.heading,
      copy.squadSubmitted.body('E', 'T'),
      copy.squadSubmitted.members(18),
      copy.squadSubmitted.action,
      copy.invitation.subject,
      copy.invitation.heading,
      copy.invitation.body,
      copy.invitation.action,
      copy.invitation.expires('2026-01-01T00:00:00.000Z'),
      copy.passwordReset.subject,
      copy.passwordReset.heading,
      copy.passwordReset.body,
      copy.passwordReset.action,
      copy.passwordReset.expires('2026-01-01T00:00:00.000Z'),
      copy.passwordReset.ignore,
    ];
    for (const value of strings) expect(value.trim()).not.toBe('');
  });

  it('interpolates names and the member count', () => {
    expect(emailCopy('es').squadSubmitted.members(18)).toContain('18');
    expect(emailCopy('de').entrantRegistered.body('Club A', 'Liga 2026')).toContain('Club A');
    expect(emailCopy('zh').tournamentCreated.subject('Liga 2026')).toContain('Liga 2026');
  });

  it('differs per language, so no language silently falls back to English', () => {
    const english = emailCopy('en').tournamentCreated.heading;
    for (const language of SUPPORTED_LANGUAGES.filter((code) => code !== 'en')) {
      expect(emailCopy(language).tournamentCreated.heading).not.toBe(english);
    }
  });
});
