import { formatActivityAction, formatActivityReason } from './activity-formatting.js';

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

    it('uses the default locale when omitted', () => {
      expect(formatActivityAction('match.finalized')).toBe('Partido finalizado');
    });
  });

  describe('formatActivityReason', () => {
    it('translates known authorization refusal reasons to Spanish and English', () => {
      expect(
        formatActivityReason('Subject organization role is not authorized for this route', 'es'),
      ).toBe('El rol en la organización no está autorizado para esta ruta');
      expect(
        formatActivityReason('Subject organization role is not authorized for this route', 'en'),
      ).toBe('Subject organization role is not authorized for this route');
      expect(formatActivityReason('Subject has no active organization role', 'es')).toBe(
        'El usuario no tiene un rol activo en la organización',
      );
    });

    it('translates parameterized prefix matches', () => {
      expect(formatActivityReason('Token is missing required scope: org.admin', 'es')).toBe(
        'El token no posee el permiso requerido',
      );
      expect(formatActivityReason('Token is missing required scope: org.admin', 'en')).toBe(
        'Token is missing required scope',
      );
    });

    it('falls back to the raw string if unrecognized', () => {
      expect(formatActivityReason('Custom custom reason', 'es')).toBe('Custom custom reason');
    });

    it('returns empty string when reason is undefined', () => {
      expect(formatActivityReason(undefined, 'es')).toBe('');
    });
  });
});
