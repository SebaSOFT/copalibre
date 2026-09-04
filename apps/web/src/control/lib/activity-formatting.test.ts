import { formatActivityAction, formatRelativeTime } from './activity-formatting.js';

describe('activity-formatting', () => {
  describe('formatActivityAction', () => {
    it('handles match finalization events in both Spanish and English', () => {
      expect(formatActivityAction('match.finalized', 'es')).toBe('Partido finalizado');
      expect(formatActivityAction('match.finalized', 'en')).toBe('Match finalized');
      expect(formatActivityAction('match.finalize', 'es')).toBe('Partido finalizado');
      expect(formatActivityAction('match.finalize', 'en')).toBe('Match finalized');
    });

    it('handles registration events in both Spanish and English', () => {
      expect(formatActivityAction('entrant.registered', 'es')).toBe('Inscripción registrada');
      expect(formatActivityAction('entrant.registered', 'en')).toBe('Registration recorded');
      expect(formatActivityAction('entrant.accepted', 'es')).toBe('Inscripción aprobada');
      expect(formatActivityAction('entrant.accepted', 'en')).toBe('Registration approved');
      expect(formatActivityAction('entrant.pending', 'es')).toBe('Inscripción pendiente');
    });

    it('handles club creation events in both Spanish and English', () => {
      expect(formatActivityAction('club.created', 'es')).toBe('Club creado');
      expect(formatActivityAction('club.created', 'en')).toBe('Club created');
    });

    it('handles additional lifecycle and operational events', () => {
      expect(formatActivityAction('tournament.created', 'es')).toBe('Torneo creado');
      expect(formatActivityAction('tournament.published', 'es')).toBe('Torneo publicado');
      expect(formatActivityAction('stage.created', 'es')).toBe('Etapa creada');
      expect(formatActivityAction('player.role-updated', 'es')).toBe('Rol de miembro actualizado');
    });

    it('falls back to humanized action when encountering an unknown action', () => {
      expect(formatActivityAction('custom-domain.action-performed')).toBe('Action performed');
      expect(formatActivityAction('simple_action')).toBe('Simple action');
    });
  });

  describe('formatRelativeTime', () => {
    const baseTime = new Date('2026-09-04T12:00:00.000Z').getTime();

    it('formats recent events (<45s) as just now / hace un momento', () => {
      const recent = new Date(baseTime - 10_000).toISOString();
      expect(formatRelativeTime(recent, baseTime, 'es')).toBe('hace un momento');
      expect(formatRelativeTime(recent, baseTime, 'en')).toBe('just now');
    });

    it('formats minute differences', () => {
      const fiveMinsAgo = new Date(baseTime - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(fiveMinsAgo, baseTime, 'es')).toContain('5');
      expect(formatRelativeTime(fiveMinsAgo, baseTime, 'en')).toBe('5 minutes ago');
    });

    it('formats hour differences', () => {
      const twoHoursAgo = new Date(baseTime - 2 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(twoHoursAgo, baseTime, 'es')).toContain('2');
      expect(formatRelativeTime(twoHoursAgo, baseTime, 'en')).toBe('2 hours ago');
    });

    it('formats day differences', () => {
      const threeDaysAgo = new Date(baseTime - 3 * 86400 * 1000).toISOString();
      expect(formatRelativeTime(threeDaysAgo, baseTime, 'es')).toContain('3');
      expect(formatRelativeTime(threeDaysAgo, baseTime, 'en')).toBe('3 days ago');
    });
  });
});
