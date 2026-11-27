/** Localized labels for each reason an activity was refused, and the reason codes of the activity feed. */

import { type LocalizedLabel } from '@copalibre/domain';

const REFUSED_UNKNOWN_ORGANIZATION: LocalizedLabel = {
  en: 'The requested organization does not exist',
  es: 'La organización solicitada no existe',
  fr: 'L’organisation demandée n’existe pas',
  pt: 'A organização solicitada não existe',
  it: 'L’organizzazione richiesta non esiste',
  de: 'Die angeforderte Organisation existiert nicht',
  ru: 'Запрошенная организация не существует',
  zh: '请求的组织不存在',
};

const REFUSED_NO_INSTALLATION_ACCOUNT: LocalizedLabel = {
  en: 'The account has no access to this installation',
  es: 'La cuenta no tiene acceso a esta instalación',
  fr: 'Le compte n’a pas accès à cette installation',
  pt: 'A conta não tem acesso a esta instalação',
  it: 'L’account non ha accesso a questa installazione',
  de: 'Das Konto hat keinen Zugriff auf diese Installation',
  ru: 'У учётной записи нет доступа к этой установке',
  zh: '该账户无权访问此安装',
};

const REFUSED_NO_PARTICIPANT: LocalizedLabel = {
  en: 'The account is not linked to a participant',
  es: 'La cuenta no está vinculada a un participante',
  fr: 'Le compte n’est lié à aucun participant',
  pt: 'A conta não está vinculada a um participante',
  it: 'L’account non è collegato a un partecipante',
  de: 'Das Konto ist mit keinem Teilnehmer verknüpft',
  ru: 'Учётная запись не связана с участником',
  zh: '该账户未关联参赛者',
};

const REFUSED_NOT_MATCH_PARTY: LocalizedLabel = {
  en: 'The account is not a party to this match',
  es: 'La cuenta no es parte de este partido',
  fr: 'Le compte n’est pas partie à ce match',
  pt: 'A conta não faz parte desta partida',
  it: 'L’account non è parte di questa partita',
  de: 'Das Konto ist an diesem Spiel nicht beteiligt',
  ru: 'Учётная запись не участвует в этом матче',
  zh: '该账户不是此比赛的参与方',
};

const REFUSED_UNVERIFIED_IDENTITY: LocalizedLabel = {
  en: 'The account could not be verified',
  es: 'No se pudo verificar la cuenta',
  fr: 'Le compte n’a pas pu être vérifié',
  pt: 'Não foi possível verificar a conta',
  it: 'Impossibile verificare l’account',
  de: 'Das Konto konnte nicht überprüft werden',
  ru: 'Не удалось проверить учётную запись',
  zh: '无法验证该账户',
};

const REFUSED_ROUTE_WITHOUT_RULE: LocalizedLabel = {
  en: 'This operation has no access rule',
  es: 'Esta operación no tiene una regla de acceso',
  fr: 'Cette opération n’a pas de règle d’accès',
  pt: 'Esta operação não tem regra de acesso',
  it: 'Questa operazione non ha una regola di accesso',
  de: 'Für diesen Vorgang gibt es keine Zugriffsregel',
  ru: 'Для этой операции нет правила доступа',
  zh: '此操作没有访问规则',
};

const REFUSED_INVALID_TOKEN: LocalizedLabel = {
  en: 'The access token is missing, invalid or expired',
  es: 'El token de acceso falta, no es válido o venció',
  fr: 'Le jeton d’accès est absent, non valide ou expiré',
  pt: 'O token de acesso está ausente, é inválido ou expirou',
  it: 'Il token di accesso è assente, non valido o scaduto',
  de: 'Das Zugriffstoken fehlt, ist ungültig oder abgelaufen',
  ru: 'Токен доступа отсутствует, недействителен или истёк',
  zh: '访问令牌缺失、无效或已过期',
};

const REFUSED_INVALID_SESSION: LocalizedLabel = {
  en: 'The session is missing, invalid or expired',
  es: 'La sesión falta, no es válida o venció',
  fr: 'La session est absente, non valide ou expirée',
  pt: 'A sessão está ausente, é inválida ou expirou',
  it: 'La sessione è assente, non valida o scaduta',
  de: 'Die Sitzung fehlt, ist ungültig oder abgelaufen',
  ru: 'Сеанс отсутствует, недействителен или истёк',
  zh: '会话缺失、无效或已过期',
};

const REFUSED_INVALID_LOGIN: LocalizedLabel = {
  en: 'Invalid email or password',
  es: 'Correo o contraseña incorrectos',
  fr: 'E-mail ou mot de passe incorrect',
  pt: 'E-mail ou senha incorretos',
  it: 'Email o password errati',
  de: 'E-Mail oder Passwort ist falsch',
  ru: 'Неверный email или пароль',
  zh: '邮箱或密码错误',
};

const REFUSED_INVALID_BOOTSTRAP: LocalizedLabel = {
  en: 'The bootstrap token is invalid',
  es: 'El token de arranque no es válido',
  fr: 'Le jeton d’amorçage n’est pas valide',
  pt: 'O token de inicialização é inválido',
  it: 'Il token di avvio non è valido',
  de: 'Das Bootstrap-Token ist ungültig',
  ru: 'Токен начальной настройки недействителен',
  zh: '引导令牌无效',
};

const REFUSED_UNVERIFIED_INVITATION_EMAIL: LocalizedLabel = {
  en: 'Accepting an invitation needs a verified email',
  es: 'Aceptar una invitación requiere un correo verificado',
  fr: 'Accepter une invitation nécessite un e-mail vérifié',
  pt: 'Aceitar um convite exige um e-mail verificado',
  it: 'Accettare un invito richiede un’email verificata',
  de: 'Zum Annehmen einer Einladung ist eine bestätigte E-Mail nötig',
  ru: 'Для принятия приглашения нужен подтверждённый email',
  zh: '接受邀请需要已验证的邮箱',
};

export const REASON_DESCRIPTIONS: Readonly<Record<string, LocalizedLabel>> = {
  'match finalized from recorded facts': {
    en: 'Match finalized from recorded facts',
    es: 'Partido finalizado a partir de los hechos registrados',
    fr: 'Match finalisé à partir des faits enregistrés',
    pt: 'Partida finalizada com base nos fatos registrados',
    it: 'Partita finalizzata sulla base dei fatti registrati',
    de: 'Spiel anhand der erfassten Fakten abgeschlossen',
    ru: 'Матч завершён по зафиксированным фактам',
    zh: '比赛已根据记录的事实结束',
  },
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
  'Requested organization does not exist': REFUSED_UNKNOWN_ORGANIZATION,
  'Subject has no installation principal': REFUSED_NO_INSTALLATION_ACCOUNT,
  'Subject has no participant identity': REFUSED_NO_PARTICIPANT,
  'report/dispute submission requires a participant subject': REFUSED_NO_PARTICIPANT,
  'subject is not a party to this match': REFUSED_NOT_MATCH_PARTY,
  'Authenticated route reached without a verified subject': REFUSED_UNVERIFIED_IDENTITY,
  'match commands require a verified subject': REFUSED_UNVERIFIED_IDENTITY,
  'report/dispute submission requires a verified subject': REFUSED_UNVERIFIED_IDENTITY,
  'No principal identity resolved': REFUSED_UNVERIFIED_IDENTITY,
  'Token principal not found': REFUSED_UNVERIFIED_IDENTITY,
  'Principal no longer exists': REFUSED_UNVERIFIED_IDENTITY,
  'Authenticated route has no access requirement': REFUSED_ROUTE_WITHOUT_RULE,
  'Missing bearer token': REFUSED_INVALID_TOKEN,
  'Invalid bearer token': REFUSED_INVALID_TOKEN,
  'Invalid or expired personal access token': REFUSED_INVALID_TOKEN,
  'No refresh session present': REFUSED_INVALID_SESSION,
  'Invalid refresh session': REFUSED_INVALID_SESSION,
  'Refresh session is invalid or expired': REFUSED_INVALID_SESSION,
  'Invalid email or password': REFUSED_INVALID_LOGIN,
  'Bootstrap token is invalid': REFUSED_INVALID_BOOTSTRAP,
  'Invitation acceptance requires a verified OIDC email': REFUSED_UNVERIFIED_INVITATION_EMAIL,
};
