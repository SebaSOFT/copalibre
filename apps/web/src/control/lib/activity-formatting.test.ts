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

    it('maps every newly registered domain action across all 8 supported languages', () => {
      expect(formatActivityAction('match.created', 'en')).toBe('Match created');
      expect(formatActivityAction('match.created', 'es')).toBe('Partido creado');
      expect(formatActivityAction('player.enlisted', 'en')).toBe('Player enlisted');
      expect(formatActivityAction('player.enlisted', 'fr')).toBe('Joueur inscrit');
      expect(formatActivityAction('module.installed', 'pt')).toBe('Módulo instalado');
      expect(formatActivityAction('fixtures.generated', 'it')).toBe('Calendario generato');
      expect(formatActivityAction('fixtures.regenerated', 'de')).toBe('Spielplan neu erstellt');
      expect(formatActivityAction('ruleset.compiled', 'ru')).toBe('Регламент скомпилирован');
      expect(formatActivityAction('ruleset.versioned', 'zh')).toBe('已创建新版本规则集');
      expect(formatActivityAction('zone.created', 'es')).toBe('Zona creada');
      expect(formatActivityAction('group.created', 'en')).toBe('Group created');
      expect(formatActivityAction('season.created', 'es')).toBe('Temporada creada');
    });

    it('localizes a pre-existing action into a non-es/en language (openspec 0280)', () => {
      // Before openspec 0280, every locale other than es/en silently rendered
      // the English defaultMessage — this asserts the previously-blind
      // languages now genuinely resolve their own translation.
      expect(formatActivityAction('segment.completed', 'fr')).toBe('Segment terminé');
      expect(formatActivityAction('tournament.published', 'de')).toBe('Turnier veröffentlicht');
      expect(formatActivityAction('entrant.accepted', 'ru')).toBe('Регистрация одобрена');
      expect(formatActivityAction('club.created', 'zh')).toBe('俱乐部已创建');
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

    it('localizes a refusal reason into a non-es/en language (openspec 0280)', () => {
      expect(formatActivityReason('Subject is not scoped to this organization', 'fr')).toBe(
        "L'utilisateur n'appartient pas à cette organisation",
      );
      expect(formatActivityReason('Token is missing required scope: org.admin', 'zh')).toBe(
        '令牌缺少所需的权限范围',
      );
    });
  });
});
