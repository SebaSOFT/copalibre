/**
 * Formatters for the administrative activity feed and audit trail.
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
  };

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

/**
 * Formats an ISO date string into a relative time string using Intl.RelativeTimeFormat.
 */
export function formatRelativeTime(
  isoDate: string | Date,
  now: number = Date.now(),
  locale = 'es',
): string {
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  const elapsedSeconds = Math.round((date.getTime() - now) / 1000);
  const absSeconds = Math.abs(elapsedSeconds);
  const isSpanish = locale.toLowerCase().startsWith('es');

  if (Number.isNaN(elapsedSeconds)) {
    return String(isoDate);
  }

  if (absSeconds < 45) {
    return isSpanish ? 'hace un momento' : 'just now';
  }

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absSeconds < 3600) {
    const minutes = Math.round(elapsedSeconds / 60);
    return formatter.format(minutes, 'minute');
  }

  if (absSeconds < 86400) {
    const hours = Math.round(elapsedSeconds / 3600);
    return formatter.format(hours, 'hour');
  }

  const days = Math.round(elapsedSeconds / 86400);
  return formatter.format(days, 'day');
}
