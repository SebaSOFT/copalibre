/**
 * Formatters for the administrative activity feed and audit trail.
 *
 * Relative-time formatting used to live here (`formatRelativeTime`); it now
 * lives in `components/ui/atoms/ResponsiveTimestamp.tsx`'s `relative` format,
 * which `ActivityLog.tsx` renders through directly (openspec 0247).
 */

const ACTION_DESCRIPTIONS: Readonly<Record<string, { readonly es: string; readonly en: string }>> =
  {
    // Matches
    'match.finalized': { es: 'Partido finalizado', en: 'Match finalized' },
    'match.finalize': { es: 'Partido finalizado', en: 'Match finalized' },
    'match.start': { es: 'Partido iniciado', en: 'Match started' },
    'match.pause': { es: 'Partido pausado', en: 'Match paused' },
    'match.resume': { es: 'Partido reanudado', en: 'Match resumed' },

    // Registrations & entrants
    'entrant.registered': { es: 'Inscripción registrada', en: 'Registration recorded' },
    'entrant.accepted': { es: 'Inscripción aprobada', en: 'Registration approved' },
    'entrant.refused': { es: 'Inscripción rechazada', en: 'Registration refused' },
    'entrant.pending': { es: 'Inscripción pendiente', en: 'Registration pending' },
    'entrant.withdrawn': { es: 'Inscripción retirada', en: 'Registration withdrawn' },

    // Clubs and teams
    'club.created': { es: 'Club creado', en: 'Club created' },
    'club.updated': { es: 'Club actualizado', en: 'Club updated' },
    'team.created': { es: 'Equipo creado', en: 'Team created' },
    'team.updated': { es: 'Equipo actualizado', en: 'Team updated' },
    'player.role-updated': { es: 'Rol de miembro actualizado', en: 'Member role updated' },

    // Tournaments and stages
    'tournament.created': { es: 'Torneo creado', en: 'Tournament created' },
    'tournament.published': { es: 'Torneo publicado', en: 'Tournament published' },
    'tournament.archived': { es: 'Torneo archivado', en: 'Tournament archived' },
    'stage.created': { es: 'Etapa creada', en: 'Stage created' },

    // Resources and members
    'person.registered': { es: 'Persona registrada', en: 'Person registered' },
    'venue.created': { es: 'Sede creada', en: 'Venue created' },
    'official.created': { es: 'Oficial creado', en: 'Official created' },
    'organization.created': { es: 'Organización creada', en: 'Organization created' },
    'organization.settings_updated': { es: 'Configuración actualizada', en: 'Settings updated' },

    // Segments and timing
    'segment.clock-adjusted': { es: 'Reloj ajustado', en: 'Clock adjusted' },
    'segment.completed': { es: 'Segmento completado', en: 'Segment completed' },
    'segment.created': { es: 'Segmento creado', en: 'Segment created' },
    'segment.active': { es: 'Segmento iniciado', en: 'Segment started' },
    'segment.pending': { es: 'Segmento pendiente', en: 'Segment pending' },

    // Authorization & mutations
    'authorization.refused': { es: 'Autorización rechazada', en: 'Authorization refused' },
    'mutation.refused': { es: 'Modificación rechazada', en: 'Mutation refused' },

    // Results & corrections
    SCORE_CORRECTION: { es: 'Corrección de marcador', en: 'Score correction' },
    'match.score.recorded': { es: 'Marcador registrado', en: 'Score recorded' },
    'match.result-superseded': { es: 'Resultado corregido', en: 'Result superseded' },
  };

const REASON_DESCRIPTIONS: Readonly<Record<string, { readonly es: string; readonly en: string }>> =
  {
    'Subject organization role is not authorized for this route': {
      es: 'El rol en la organización no está autorizado para esta ruta',
      en: 'Subject organization role is not authorized for this route',
    },
    'Subject organization role is not authorized': {
      es: 'El rol en la organización no está autorizado',
      en: 'Subject organization role is not authorized',
    },
    'Subject has no active organization role': {
      es: 'El usuario no tiene un rol activo en la organización',
      en: 'Subject has no active organization role',
    },
    'Subject has no active organization admin role': {
      es: 'El usuario no tiene un rol de administración activo en la organización',
      en: 'Subject has no active organization admin role',
    },
    'Subject is not scoped to this organization': {
      es: 'El usuario no pertenece a esta organización',
      en: 'Subject is not scoped to this organization',
    },
    'Subject holds no match-control capability for this match': {
      es: 'El usuario no posee permisos de control para este partido',
      en: 'Subject holds no match-control capability for this match',
    },
    'Installation super-admin authority is required': {
      es: 'Se requiere autoridad de superadministrador de la instalación',
      en: 'Installation super-admin authority is required',
    },
    'Token is missing required scope': {
      es: 'El token no posee el permiso requerido',
      en: 'Token is missing required scope',
    },
  };

/**
 * Returns a human-readable, localized description of an audit refusal reason.
 */
export function formatActivityReason(reason: string | undefined, locale = 'es'): string {
  if (!reason) return '';
  const isSpanish = locale.toLowerCase().startsWith('es');
  const exactMatch = REASON_DESCRIPTIONS[reason];
  if (exactMatch) {
    return isSpanish ? exactMatch.es : exactMatch.en;
  }

  // Prefix match for parameterized reasons (e.g. "Token is missing required scope: ...")
  for (const [key, translation] of Object.entries(REASON_DESCRIPTIONS)) {
    if (reason.startsWith(key)) {
      return isSpanish ? translation.es : translation.en;
    }
  }

  return reason;
}

/**
 * Returns a human-readable, localized description of an audit event action.
 */
export function formatActivityAction(action: string, locale = 'es'): string {
  const isSpanish = locale.toLowerCase().startsWith('es');
  const match = ACTION_DESCRIPTIONS[action];
  if (match) {
    return isSpanish ? match.es : match.en;
  }

  // Fallback: humanize unknown actions like "report.evidence-uploaded"
  const suffix = action.includes('.') ? action.split('.').slice(1).join(' ') : action;
  const humanized = suffix.replace(/[-_]/g, ' ').trim();
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}
