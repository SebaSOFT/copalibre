/**
 * Formatters for the administrative activity feed and audit trail.
 *
 * Relative-time formatting used to live here (`formatRelativeTime`); it now
 * lives in `components/ui/atoms/ResponsiveTimestamp.tsx`'s `relative` format,
 * which `ActivityLog.tsx` renders through directly (openspec 0247).
 *
 * Resolves through the platform's canonical `resolveLabel`/`LocalizedLabel`
 * (openspec 0280) rather than a bespoke `{es, en}` pair — both dictionaries
 * used to only distinguish Spanish from an English-for-everything-else
 * fallback, silently rendering English for the other 6 supported languages.
 */
import { isSupportedLanguage, resolveLabel, type LocalizedLabel } from '@copalibre/domain';

const ACTION_DESCRIPTIONS: Readonly<Record<string, LocalizedLabel>> = {
  // Matches
  'match.finalized': {
    en: 'Match finalized',
    es: 'Partido finalizado',
    fr: 'Match terminé',
    pt: 'Partida finalizada',
    it: 'Partita finalizzata',
    de: 'Spiel beendet',
    ru: 'Матч завершён',
    zh: '比赛已结束',
  },
  'match.finalize': {
    en: 'Match finalized',
    es: 'Partido finalizado',
    fr: 'Match terminé',
    pt: 'Partida finalizada',
    it: 'Partita finalizzata',
    de: 'Spiel beendet',
    ru: 'Матч завершён',
    zh: '比赛已结束',
  },
  'match.start': {
    en: 'Match started',
    es: 'Partido iniciado',
    fr: 'Match commencé',
    pt: 'Partida iniciada',
    it: 'Partita iniziata',
    de: 'Spiel gestartet',
    ru: 'Матч начат',
    zh: '比赛已开始',
  },
  'match.pause': {
    en: 'Match paused',
    es: 'Partido pausado',
    fr: 'Match en pause',
    pt: 'Partida pausada',
    it: 'Partita in pausa',
    de: 'Spiel pausiert',
    ru: 'Матч приостановлен',
    zh: '比赛已暂停',
  },
  'match.resume': {
    en: 'Match resumed',
    es: 'Partido reanudado',
    fr: 'Match repris',
    pt: 'Partida retomada',
    it: 'Partita ripresa',
    de: 'Spiel fortgesetzt',
    ru: 'Матч возобновлён',
    zh: '比赛已恢复',
  },
  'match.created': {
    en: 'Match created',
    es: 'Partido creado',
    fr: 'Match créé',
    pt: 'Partida criada',
    it: 'Partita creata',
    de: 'Spiel erstellt',
    ru: 'Матч создан',
    zh: '比赛已创建',
  },

  // Registrations & entrants
  'entrant.registered': {
    en: 'Registration recorded',
    es: 'Inscripción registrada',
    fr: 'Inscription enregistrée',
    pt: 'Inscrição registrada',
    it: 'Iscrizione registrata',
    de: 'Anmeldung erfasst',
    ru: 'Регистрация зафиксирована',
    zh: '报名已登记',
  },
  'entrant.accepted': {
    en: 'Registration approved',
    es: 'Inscripción aprobada',
    fr: 'Inscription approuvée',
    pt: 'Inscrição aprovada',
    it: 'Iscrizione approvata',
    de: 'Anmeldung genehmigt',
    ru: 'Регистрация одобрена',
    zh: '报名已批准',
  },
  'entrant.refused': {
    en: 'Registration refused',
    es: 'Inscripción rechazada',
    fr: 'Inscription refusée',
    pt: 'Inscrição recusada',
    it: 'Iscrizione rifiutata',
    de: 'Anmeldung abgelehnt',
    ru: 'Регистрация отклонена',
    zh: '报名已拒绝',
  },
  'entrant.pending': {
    en: 'Registration pending',
    es: 'Inscripción pendiente',
    fr: 'Inscription en attente',
    pt: 'Inscrição pendente',
    it: 'Iscrizione in sospeso',
    de: 'Anmeldung ausstehend',
    ru: 'Регистрация в ожидании',
    zh: '报名待处理',
  },
  'entrant.withdrawn': {
    en: 'Registration withdrawn',
    es: 'Inscripción retirada',
    fr: 'Inscription retirée',
    pt: 'Inscrição retirada',
    it: 'Iscrizione ritirata',
    de: 'Anmeldung zurückgezogen',
    ru: 'Регистрация отозвана',
    zh: '报名已撤回',
  },

  // Clubs and teams
  'club.created': {
    en: 'Club created',
    es: 'Club creado',
    fr: 'Club créé',
    pt: 'Clube criado',
    it: 'Club creato',
    de: 'Verein erstellt',
    ru: 'Клуб создан',
    zh: '俱乐部已创建',
  },
  'club.updated': {
    en: 'Club updated',
    es: 'Club actualizado',
    fr: 'Club mis à jour',
    pt: 'Clube atualizado',
    it: 'Club aggiornato',
    de: 'Verein aktualisiert',
    ru: 'Клуб обновлён',
    zh: '俱乐部已更新',
  },
  'team.created': {
    en: 'Team created',
    es: 'Equipo creado',
    fr: 'Équipe créée',
    pt: 'Equipe criada',
    it: 'Squadra creata',
    de: 'Team erstellt',
    ru: 'Команда создана',
    zh: '队伍已创建',
  },
  'team.updated': {
    en: 'Team updated',
    es: 'Equipo actualizado',
    fr: 'Équipe mise à jour',
    pt: 'Equipe atualizada',
    it: 'Squadra aggiornata',
    de: 'Team aktualisiert',
    ru: 'Команда обновлена',
    zh: '队伍已更新',
  },
  'player.role-updated': {
    en: 'Member role updated',
    es: 'Rol de miembro actualizado',
    fr: 'Rôle du membre mis à jour',
    pt: 'Função do membro atualizada',
    it: 'Ruolo del membro aggiornato',
    de: 'Mitgliedsrolle aktualisiert',
    ru: 'Роль участника обновлена',
    zh: '成员角色已更新',
  },
  'player.enlisted': {
    en: 'Player enlisted',
    es: 'Jugador enlistado',
    fr: 'Joueur inscrit',
    pt: 'Jogador inscrito',
    it: 'Giocatore arruolato',
    de: 'Spieler aufgenommen',
    ru: 'Игрок зачислен',
    zh: '球员已加入',
  },

  // Tournaments and stages
  'tournament.created': {
    en: 'Tournament created',
    es: 'Torneo creado',
    fr: 'Tournoi créé',
    pt: 'Torneio criado',
    it: 'Torneo creato',
    de: 'Turnier erstellt',
    ru: 'Турнир создан',
    zh: '赛事已创建',
  },
  'tournament.published': {
    en: 'Tournament published',
    es: 'Torneo publicado',
    fr: 'Tournoi publié',
    pt: 'Torneio publicado',
    it: 'Torneo pubblicato',
    de: 'Turnier veröffentlicht',
    ru: 'Турнир опубликован',
    zh: '赛事已发布',
  },
  'tournament.archived': {
    en: 'Tournament archived',
    es: 'Torneo archivado',
    fr: 'Tournoi archivé',
    pt: 'Torneio arquivado',
    it: 'Torneo archiviato',
    de: 'Turnier archiviert',
    ru: 'Турнир заархивирован',
    zh: '赛事已归档',
  },
  'stage.created': {
    en: 'Stage created',
    es: 'Etapa creada',
    fr: 'Étape créée',
    pt: 'Etapa criada',
    it: 'Fase creata',
    de: 'Phase erstellt',
    ru: 'Этап создан',
    zh: '阶段已创建',
  },
  'zone.created': {
    en: 'Zone created',
    es: 'Zona creada',
    fr: 'Zone créée',
    pt: 'Zona criada',
    it: 'Zona creata',
    de: 'Zone erstellt',
    ru: 'Зона создана',
    zh: '分区已创建',
  },
  'group.created': {
    en: 'Group created',
    es: 'Grupo creado',
    fr: 'Groupe créé',
    pt: 'Grupo criado',
    it: 'Girone creato',
    de: 'Gruppe erstellt',
    ru: 'Группа создана',
    zh: '小组已创建',
  },
  'season.created': {
    en: 'Season created',
    es: 'Temporada creada',
    fr: 'Saison créée',
    pt: 'Temporada criada',
    it: 'Stagione creata',
    de: 'Saison erstellt',
    ru: 'Сезон создан',
    zh: '赛季已创建',
  },

  // Resources and members
  'person.registered': {
    en: 'Person registered',
    es: 'Persona registrada',
    fr: 'Personne enregistrée',
    pt: 'Pessoa registrada',
    it: 'Persona registrata',
    de: 'Person registriert',
    ru: 'Человек зарегистрирован',
    zh: '人员已登记',
  },
  'venue.created': {
    en: 'Venue created',
    es: 'Sede creada',
    fr: 'Lieu créé',
    pt: 'Local criado',
    it: 'Sede creata',
    de: 'Austragungsort erstellt',
    ru: 'Место проведения создано',
    zh: '场地已创建',
  },
  'official.created': {
    en: 'Official created',
    es: 'Oficial creado',
    fr: 'Officiel créé',
    pt: 'Árbitro criado',
    it: 'Ufficiale di gara creato',
    de: 'Offizieller erstellt',
    ru: 'Официальное лицо создано',
    zh: '裁判已创建',
  },
  'organization.created': {
    en: 'Organization created',
    es: 'Organización creada',
    fr: 'Organisation créée',
    pt: 'Organização criada',
    it: 'Organizzazione creata',
    de: 'Organisation erstellt',
    ru: 'Организация создана',
    zh: '组织已创建',
  },
  'organization.settings_updated': {
    en: 'Settings updated',
    es: 'Configuración actualizada',
    fr: 'Paramètres mis à jour',
    pt: 'Configurações atualizadas',
    it: 'Impostazioni aggiornate',
    de: 'Einstellungen aktualisiert',
    ru: 'Настройки обновлены',
    zh: '设置已更新',
  },

  // Segments and timing
  'segment.clock-adjusted': {
    en: 'Segment clock adjusted',
    es: 'Reloj de segmento ajustado',
    fr: 'Horloge du segment ajustée',
    pt: 'Relógio do segmento ajustado',
    it: 'Orologio del segmento regolato',
    de: 'Segmentuhr angepasst',
    ru: 'Часы сегмента скорректированы',
    zh: '分段时钟已调整',
  },
  'segment.completed': {
    en: 'Segment completed',
    es: 'Segmento completado',
    fr: 'Segment terminé',
    pt: 'Segmento concluído',
    it: 'Segmento completato',
    de: 'Segment abgeschlossen',
    ru: 'Сегмент завершён',
    zh: '分段已完成',
  },
  'segment.created': {
    en: 'Segment created',
    es: 'Segmento creado',
    fr: 'Segment créé',
    pt: 'Segmento criado',
    it: 'Segmento creato',
    de: 'Segment erstellt',
    ru: 'Сегмент создан',
    zh: '分段已创建',
  },
  'segment.active': {
    en: 'Segment started',
    es: 'Segmento iniciado',
    fr: 'Segment commencé',
    pt: 'Segmento iniciado',
    it: 'Segmento iniziato',
    de: 'Segment gestartet',
    ru: 'Сегмент начат',
    zh: '分段已开始',
  },
  'segment.pending': {
    en: 'Segment pending',
    es: 'Segmento pendiente',
    fr: 'Segment en attente',
    pt: 'Segmento pendente',
    it: 'Segmento in sospeso',
    de: 'Segment ausstehend',
    ru: 'Сегмент в ожидании',
    zh: '分段待处理',
  },

  // Modules and fixtures
  'module.installed': {
    en: 'Module installed',
    es: 'Módulo instalado',
    fr: 'Module installé',
    pt: 'Módulo instalado',
    it: 'Modulo installato',
    de: 'Modul installiert',
    ru: 'Модуль установлен',
    zh: '模块已安装',
  },
  'fixtures.generated': {
    en: 'Fixtures generated',
    es: 'Partidos generados',
    fr: 'Calendrier généré',
    pt: 'Partidas geradas',
    it: 'Calendario generato',
    de: 'Spielplan erstellt',
    ru: 'Расписание сгенерировано',
    zh: '赛程已生成',
  },
  'fixtures.regenerated': {
    en: 'Fixtures regenerated',
    es: 'Partidos regenerados',
    fr: 'Calendrier régénéré',
    pt: 'Partidas regeneradas',
    it: 'Calendario rigenerato',
    de: 'Spielplan neu erstellt',
    ru: 'Расписание перегенерировано',
    zh: '赛程已重新生成',
  },
  'ruleset.compiled': {
    en: 'Ruleset compiled',
    es: 'Reglamento compilado',
    fr: 'Règlement compilé',
    pt: 'Regulamento compilado',
    it: 'Regolamento compilato',
    de: 'Regelwerk kompiliert',
    ru: 'Регламент скомпилирован',
    zh: '规则集已编译',
  },
  'ruleset.versioned': {
    en: 'Ruleset versioned',
    es: 'Versión de reglamento creada',
    fr: 'Nouvelle version du règlement créée',
    pt: 'Nova versão do regulamento criada',
    it: 'Nuova versione del regolamento creata',
    de: 'Neue Regelwerksversion erstellt',
    ru: 'Создана новая версия регламента',
    zh: '已创建新版本规则集',
  },

  // Authorization & mutations
  'authorization.refused': {
    en: 'Authorization refused',
    es: 'Autorización rechazada',
    fr: 'Autorisation refusée',
    pt: 'Autorização recusada',
    it: 'Autorizzazione rifiutata',
    de: 'Autorisierung abgelehnt',
    ru: 'В авторизации отказано',
    zh: '授权已拒绝',
  },
  'mutation.refused': {
    en: 'Mutation refused',
    es: 'Modificación rechazada',
    fr: 'Modification refusée',
    pt: 'Modificação recusada',
    it: 'Modifica rifiutata',
    de: 'Änderung abgelehnt',
    ru: 'Изменение отклонено',
    zh: '变更已拒绝',
  },

  // Results & corrections
  SCORE_CORRECTION: {
    en: 'Score correction',
    es: 'Corrección de marcador',
    fr: 'Correction du score',
    pt: 'Correção do placar',
    it: 'Correzione del punteggio',
    de: 'Ergebniskorrektur',
    ru: 'Исправление счёта',
    zh: '比分更正',
  },
  'match.score.recorded': {
    en: 'Score recorded',
    es: 'Marcador registrado',
    fr: 'Score enregistré',
    pt: 'Placar registrado',
    it: 'Punteggio registrato',
    de: 'Ergebnis erfasst',
    ru: 'Счёт зафиксирован',
    zh: '比分已记录',
  },
  'match.result-superseded': {
    en: 'Result superseded',
    es: 'Resultado corregido',
    fr: 'Résultat remplacé',
    pt: 'Resultado substituído',
    it: 'Risultato sostituito',
    de: 'Ergebnis ersetzt',
    ru: 'Результат заменён',
    zh: '结果已被替代',
  },
};

const REASON_DESCRIPTIONS: Readonly<Record<string, LocalizedLabel>> = {
  'Subject organization role is not authorized for this route': {
    en: 'Subject organization role is not authorized for this route',
    es: 'El rol en la organización no está autorizado para esta ruta',
    fr: "Le rôle dans l'organisation n'est pas autorisé pour cette route",
    pt: 'A função na organização não está autorizada para esta rota',
    it: "Il ruolo nell'organizzazione non è autorizzato per questa rotta",
    de: 'Die Rolle in der Organisation ist für diese Route nicht autorisiert',
    ru: 'Роль в организации не авторизована для этого маршрута',
    zh: '该组织角色未获授权访问此路由',
  },
  'Subject organization role is not authorized': {
    en: 'Subject organization role is not authorized',
    es: 'El rol en la organización no está autorizado',
    fr: "Le rôle dans l'organisation n'est pas autorisé",
    pt: 'A função na organização não está autorizada',
    it: "Il ruolo nell'organizzazione non è autorizzato",
    de: 'Die Rolle in der Organisation ist nicht autorisiert',
    ru: 'Роль в организации не авторизована',
    zh: '该组织角色未获授权',
  },
  'Subject has no active organization role': {
    en: 'Subject has no active organization role',
    es: 'El usuario no tiene un rol activo en la organización',
    fr: "L'utilisateur n'a pas de rôle actif dans l'organisation",
    pt: 'O usuário não tem uma função ativa na organização',
    it: "L'utente non ha un ruolo attivo nell'organizzazione",
    de: 'Der Benutzer hat keine aktive Rolle in der Organisation',
    ru: 'У пользователя нет активной роли в организации',
    zh: '该用户在组织中没有活跃角色',
  },
  'Subject has no active organization admin role': {
    en: 'Subject has no active organization admin role',
    es: 'El usuario no tiene un rol de administración activo en la organización',
    fr: "L'utilisateur n'a pas de rôle d'administrateur actif dans l'organisation",
    pt: 'O usuário não tem uma função de administrador ativa na organização',
    it: "L'utente non ha un ruolo di amministratore attivo nell'organizzazione",
    de: 'Der Benutzer hat keine aktive Administratorrolle in der Organisation',
    ru: 'У пользователя нет активной роли администратора в организации',
    zh: '该用户在组织中没有活跃的管理员角色',
  },
  'Subject is not scoped to this organization': {
    en: 'Subject is not scoped to this organization',
    es: 'El usuario no pertenece a esta organización',
    fr: "L'utilisateur n'appartient pas à cette organisation",
    pt: 'O usuário não pertence a esta organização',
    it: "L'utente non appartiene a questa organizzazione",
    de: 'Der Benutzer gehört nicht zu dieser Organisation',
    ru: 'Пользователь не принадлежит этой организации',
    zh: '该用户不属于此组织',
  },
  'Subject holds no match-control capability for this match': {
    en: 'Subject holds no match-control capability for this match',
    es: 'El usuario no posee permisos de control para este partido',
    fr: "L'utilisateur ne dispose pas des droits de contrôle pour ce match",
    pt: 'O usuário não possui permissões de controle para esta partida',
    it: "L'utente non possiede i permessi di controllo per questa partita",
    de: 'Der Benutzer verfügt nicht über die Spielsteuerungsberechtigung für dieses Spiel',
    ru: 'У пользователя нет прав управления этим матчем',
    zh: '该用户没有此比赛的控制权限',
  },
  'Installation super-admin authority is required': {
    en: 'Installation super-admin authority is required',
    es: 'Se requiere autoridad de superadministrador de la instalación',
    fr: "L'autorité de super-administrateur de l'installation est requise",
    pt: 'É necessária autoridade de superadministrador da instalação',
    it: "È richiesta l'autorità di super-amministratore dell'installazione",
    de: 'Superadministrator-Berechtigung der Installation erforderlich',
    ru: 'Требуются права суперадминистратора установки',
    zh: '需要安装的超级管理员权限',
  },
  'Token is missing required scope': {
    en: 'Token is missing required scope',
    es: 'El token no posee el permiso requerido',
    fr: 'Le jeton ne possède pas la portée requise',
    pt: 'O token não possui o escopo necessário',
    it: 'Il token non possiede la portata richiesta',
    de: 'Dem Token fehlt der erforderliche Berechtigungsumfang',
    ru: 'У токена отсутствует необходимая область действия',
    zh: '令牌缺少所需的权限范围',
  },
};

/**
 * Returns a human-readable, localized description of an audit refusal reason.
 */
export function formatActivityReason(reason: string | undefined, locale = 'es'): string {
  if (!reason) return '';
  const language = isSupportedLanguage(locale) ? locale : 'en';
  const exactMatch = REASON_DESCRIPTIONS[reason];
  if (exactMatch) {
    return resolveLabel(exactMatch, language);
  }

  // Prefix match for parameterized reasons (e.g. "Token is missing required scope: ...")
  for (const [key, label] of Object.entries(REASON_DESCRIPTIONS)) {
    if (reason.startsWith(key)) {
      return resolveLabel(label, language);
    }
  }

  return reason;
}

/**
 * Returns a human-readable, localized description of an audit event action.
 */
export function formatActivityAction(action: string, locale = 'es'): string {
  const language = isSupportedLanguage(locale) ? locale : 'en';
  const match = ACTION_DESCRIPTIONS[action];
  if (match) {
    return resolveLabel(match, language);
  }

  // Fallback: humanize unknown actions like "report.evidence-uploaded"
  const suffix = action.includes('.') ? action.split('.').slice(1).join(' ') : action;
  const humanized = suffix.replace(/[-_]/g, ' ').trim();
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}
