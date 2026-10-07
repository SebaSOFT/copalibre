import type { SupportedLanguage } from '@copalibre/domain';

/**
 * Every string an email can carry, for each supported language.
 *
 * `Record<SupportedLanguage, EmailCopy>` makes a missing language a compile error rather than a
 * silent English fallback. Terminology follows `docs/i18n-glossary.md` and the control-panel
 * catalogues (registration = inscripción / inscription / inscrição / iscrizione / Anmeldung).
 * Translations other than `en` and `es` are machine-assisted drafts: the internationalization
 * spec requires human confirmation before they are published.
 */
export interface EmailCopy {
  /** Footer line beside the Copa Libre logo. */
  readonly sentBy: string;
  readonly tournamentCreated: {
    readonly subject: (tournament: string) => string;
    readonly heading: string;
    readonly body: (tournament: string) => string;
    readonly action: string;
  };
  readonly clubCreated: {
    readonly subject: (club: string) => string;
    readonly heading: string;
    readonly body: (club: string) => string;
    readonly action: string;
  };
  readonly entrantRegistered: {
    readonly subject: (entrant: string, tournament: string) => string;
    readonly heading: string;
    readonly body: (entrant: string, tournament: string) => string;
    readonly action: string;
  };
  readonly squadSubmitted: {
    readonly subject: (team: string, tournament: string) => string;
    readonly heading: string;
    readonly body: (team: string, tournament: string) => string;
    readonly members: (count: number) => string;
    readonly action: string;
  };
  readonly invitation: {
    readonly subject: string;
    readonly heading: string;
    readonly body: string;
    readonly action: string;
    readonly expires: (at: string) => string;
  };
  readonly passwordReset: {
    readonly subject: string;
    readonly heading: string;
    readonly body: string;
    readonly action: string;
    readonly expires: (at: string) => string;
    readonly ignore: string;
  };
}

const en: EmailCopy = {
  sentBy: 'Sent by Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `New tournament: ${tournament}`,
    heading: 'New tournament created',
    body: (tournament) => `${tournament} was created in your organization.`,
    action: 'Open tournament',
  },
  clubCreated: {
    subject: (club) => `New club: ${club}`,
    heading: 'New club created',
    body: (club) => `${club} was added to your organization.`,
    action: 'Open clubs',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `New registration: ${entrant} in ${tournament}`,
    heading: 'New registration',
    body: (entrant, tournament) => `${entrant} registered in ${tournament}.`,
    action: 'Review registrations',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Squad submitted: ${team} in ${tournament}`,
    heading: 'Squad submitted',
    body: (team, tournament) => `${team} submitted its squad for ${tournament}.`,
    members: (count) => `Members in the squad: ${count}`,
    action: 'Review registrations',
  },
  invitation: {
    subject: 'CopaLibre invitation',
    heading: 'You have been invited to CopaLibre.',
    body: 'Use the link below to accept the invitation.',
    action: 'Accept invitation',
    expires: (at) => `This invitation expires at ${at}.`,
  },
  passwordReset: {
    subject: 'CopaLibre password reset',
    heading: 'A password reset was requested for your CopaLibre account.',
    body: 'Use the link below to choose a new password.',
    action: 'Reset your password',
    expires: (at) => `This link expires at ${at}.`,
    ignore: 'If you did not request this, you can ignore this email.',
  },
};

const es: EmailCopy = {
  sentBy: 'Enviado por Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `Nuevo torneo: ${tournament}`,
    heading: 'Nuevo torneo creado',
    body: (tournament) => `Se creó ${tournament} en tu organización.`,
    action: 'Abrir torneo',
  },
  clubCreated: {
    subject: (club) => `Nuevo club: ${club}`,
    heading: 'Nuevo club creado',
    body: (club) => `Se agregó ${club} a tu organización.`,
    action: 'Abrir clubes',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `Nueva inscripción: ${entrant} en ${tournament}`,
    heading: 'Nueva inscripción',
    body: (entrant, tournament) => `${entrant} se inscribió en ${tournament}.`,
    action: 'Revisar inscripciones',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Plantel enviado: ${team} en ${tournament}`,
    heading: 'Plantel enviado',
    body: (team, tournament) => `${team} envió su plantel para ${tournament}.`,
    members: (count) => `Integrantes del plantel: ${count}`,
    action: 'Revisar inscripciones',
  },
  invitation: {
    subject: 'Invitación a CopaLibre',
    heading: 'Te invitaron a CopaLibre.',
    body: 'Usá el enlace de abajo para aceptar la invitación.',
    action: 'Aceptar invitación',
    expires: (at) => `Esta invitación vence el ${at}.`,
  },
  passwordReset: {
    subject: 'Restablecer contraseña de CopaLibre',
    heading: 'Se pidió restablecer la contraseña de tu cuenta de CopaLibre.',
    body: 'Usá el enlace de abajo para elegir una contraseña nueva.',
    action: 'Restablecer contraseña',
    expires: (at) => `Este enlace vence el ${at}.`,
    ignore: 'Si no lo pediste, podés ignorar este correo.',
  },
};

const fr: EmailCopy = {
  sentBy: 'Envoyé par Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `Nouveau tournoi : ${tournament}`,
    heading: 'Nouveau tournoi créé',
    body: (tournament) => `${tournament} a été créé dans votre organisation.`,
    action: 'Ouvrir le tournoi',
  },
  clubCreated: {
    subject: (club) => `Nouveau club : ${club}`,
    heading: 'Nouveau club créé',
    body: (club) => `${club} a été ajouté à votre organisation.`,
    action: 'Ouvrir les clubs',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `Nouvelle inscription : ${entrant} à ${tournament}`,
    heading: 'Nouvelle inscription',
    body: (entrant, tournament) => `${entrant} s’est inscrit à ${tournament}.`,
    action: 'Examiner les inscriptions',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Effectif envoyé : ${team} pour ${tournament}`,
    heading: 'Effectif envoyé',
    body: (team, tournament) => `${team} a envoyé son effectif pour ${tournament}.`,
    members: (count) => `Membres de l’effectif : ${count}`,
    action: 'Examiner les inscriptions',
  },
  invitation: {
    subject: 'Invitation à CopaLibre',
    heading: 'Vous avez été invité à CopaLibre.',
    body: 'Utilisez le lien ci-dessous pour accepter l’invitation.',
    action: 'Accepter l’invitation',
    expires: (at) => `Cette invitation expire le ${at}.`,
  },
  passwordReset: {
    subject: 'Réinitialisation du mot de passe CopaLibre',
    heading: 'Une réinitialisation du mot de passe de votre compte CopaLibre a été demandée.',
    body: 'Utilisez le lien ci-dessous pour choisir un nouveau mot de passe.',
    action: 'Réinitialiser le mot de passe',
    expires: (at) => `Ce lien expire le ${at}.`,
    ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
  },
};

const pt: EmailCopy = {
  sentBy: 'Enviado pela Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `Novo torneio: ${tournament}`,
    heading: 'Novo torneio criado',
    body: (tournament) => `${tournament} foi criado na sua organização.`,
    action: 'Abrir torneio',
  },
  clubCreated: {
    subject: (club) => `Novo clube: ${club}`,
    heading: 'Novo clube criado',
    body: (club) => `${club} foi adicionado à sua organização.`,
    action: 'Abrir clubes',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `Nova inscrição: ${entrant} em ${tournament}`,
    heading: 'Nova inscrição',
    body: (entrant, tournament) => `${entrant} inscreveu-se em ${tournament}.`,
    action: 'Revisar inscrições',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Elenco enviado: ${team} em ${tournament}`,
    heading: 'Elenco enviado',
    body: (team, tournament) => `${team} enviou o seu elenco para ${tournament}.`,
    members: (count) => `Integrantes do elenco: ${count}`,
    action: 'Revisar inscrições',
  },
  invitation: {
    subject: 'Convite para o CopaLibre',
    heading: 'Você foi convidado para o CopaLibre.',
    body: 'Use o link abaixo para aceitar o convite.',
    action: 'Aceitar convite',
    expires: (at) => `Este convite expira em ${at}.`,
  },
  passwordReset: {
    subject: 'Redefinição de senha do CopaLibre',
    heading: 'Foi solicitada a redefinição da senha da sua conta CopaLibre.',
    body: 'Use o link abaixo para escolher uma nova senha.',
    action: 'Redefinir senha',
    expires: (at) => `Este link expira em ${at}.`,
    ignore: 'Se você não solicitou, ignore este e-mail.',
  },
};

const it: EmailCopy = {
  sentBy: 'Inviato da Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `Nuovo torneo: ${tournament}`,
    heading: 'Nuovo torneo creato',
    body: (tournament) => `${tournament} è stato creato nella tua organizzazione.`,
    action: 'Apri il torneo',
  },
  clubCreated: {
    subject: (club) => `Nuovo club: ${club}`,
    heading: 'Nuovo club creato',
    body: (club) => `${club} è stato aggiunto alla tua organizzazione.`,
    action: 'Apri i club',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `Nuova iscrizione: ${entrant} a ${tournament}`,
    heading: 'Nuova iscrizione',
    body: (entrant, tournament) => `${entrant} si è iscritto a ${tournament}.`,
    action: 'Rivedi le iscrizioni',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Rosa inviata: ${team} per ${tournament}`,
    heading: 'Rosa inviata',
    body: (team, tournament) => `${team} ha inviato la propria rosa per ${tournament}.`,
    members: (count) => `Componenti della rosa: ${count}`,
    action: 'Rivedi le iscrizioni',
  },
  invitation: {
    subject: 'Invito a CopaLibre',
    heading: 'Sei stato invitato a CopaLibre.',
    body: 'Usa il link qui sotto per accettare l’invito.',
    action: 'Accetta l’invito',
    expires: (at) => `Questo invito scade il ${at}.`,
  },
  passwordReset: {
    subject: 'Reimpostazione della password di CopaLibre',
    heading: 'È stata richiesta la reimpostazione della password del tuo account CopaLibre.',
    body: 'Usa il link qui sotto per scegliere una nuova password.',
    action: 'Reimposta la password',
    expires: (at) => `Questo link scade il ${at}.`,
    ignore: 'Se non l’hai richiesto, puoi ignorare questa email.',
  },
};

const de: EmailCopy = {
  sentBy: 'Gesendet von Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `Neues Turnier: ${tournament}`,
    heading: 'Neues Turnier erstellt',
    body: (tournament) => `${tournament} wurde in Ihrer Organisation erstellt.`,
    action: 'Turnier öffnen',
  },
  clubCreated: {
    subject: (club) => `Neuer Verein: ${club}`,
    heading: 'Neuer Verein erstellt',
    body: (club) => `${club} wurde Ihrer Organisation hinzugefügt.`,
    action: 'Vereine öffnen',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `Neue Anmeldung: ${entrant} bei ${tournament}`,
    heading: 'Neue Anmeldung',
    body: (entrant, tournament) => `${entrant} hat sich für ${tournament} angemeldet.`,
    action: 'Anmeldungen prüfen',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Kader eingereicht: ${team} für ${tournament}`,
    heading: 'Kader eingereicht',
    body: (team, tournament) => `${team} hat den Kader für ${tournament} eingereicht.`,
    members: (count) => `Mitglieder im Kader: ${count}`,
    action: 'Anmeldungen prüfen',
  },
  invitation: {
    subject: 'Einladung zu CopaLibre',
    heading: 'Sie wurden zu CopaLibre eingeladen.',
    body: 'Verwenden Sie den folgenden Link, um die Einladung anzunehmen.',
    action: 'Einladung annehmen',
    expires: (at) => `Diese Einladung läuft am ${at} ab.`,
  },
  passwordReset: {
    subject: 'CopaLibre-Passwort zurücksetzen',
    heading: 'Für Ihr CopaLibre-Konto wurde ein Zurücksetzen des Passworts angefordert.',
    body: 'Verwenden Sie den folgenden Link, um ein neues Passwort festzulegen.',
    action: 'Passwort zurücksetzen',
    expires: (at) => `Dieser Link läuft am ${at} ab.`,
    ignore: 'Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.',
  },
};

const ru: EmailCopy = {
  sentBy: 'Отправлено Copa Libre',
  tournamentCreated: {
    subject: (tournament) => `Новый турнир: ${tournament}`,
    heading: 'Создан новый турнир',
    body: (tournament) => `Турнир «${tournament}» создан в вашей организации.`,
    action: 'Открыть турнир',
  },
  clubCreated: {
    subject: (club) => `Новый клуб: ${club}`,
    heading: 'Создан новый клуб',
    body: (club) => `Клуб «${club}» добавлен в вашу организацию.`,
    action: 'Открыть клубы',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `Новая регистрация: ${entrant} — ${tournament}`,
    heading: 'Новая регистрация',
    body: (entrant, tournament) => `${entrant} зарегистрирован в турнире «${tournament}».`,
    action: 'Проверить регистрации',
  },
  squadSubmitted: {
    subject: (team, tournament) => `Состав отправлен: ${team} — ${tournament}`,
    heading: 'Состав отправлен',
    body: (team, tournament) => `${team} отправила состав на турнир «${tournament}».`,
    members: (count) => `Участников в составе: ${count}`,
    action: 'Проверить регистрации',
  },
  invitation: {
    subject: 'Приглашение в CopaLibre',
    heading: 'Вас пригласили в CopaLibre.',
    body: 'Перейдите по ссылке ниже, чтобы принять приглашение.',
    action: 'Принять приглашение',
    expires: (at) => `Приглашение действует до ${at}.`,
  },
  passwordReset: {
    subject: 'Сброс пароля CopaLibre',
    heading: 'Запрошен сброс пароля для вашей учётной записи CopaLibre.',
    body: 'Перейдите по ссылке ниже, чтобы задать новый пароль.',
    action: 'Сбросить пароль',
    expires: (at) => `Ссылка действует до ${at}.`,
    ignore: 'Если вы не запрашивали это, проигнорируйте письмо.',
  },
};

const zh: EmailCopy = {
  sentBy: '由 Copa Libre 发送',
  tournamentCreated: {
    subject: (tournament) => `新赛事：${tournament}`,
    heading: '已创建新赛事',
    body: (tournament) => `您的组织中已创建赛事“${tournament}”。`,
    action: '打开赛事',
  },
  clubCreated: {
    subject: (club) => `新俱乐部：${club}`,
    heading: '已创建新俱乐部',
    body: (club) => `俱乐部“${club}”已添加到您的组织。`,
    action: '打开俱乐部',
  },
  entrantRegistered: {
    subject: (entrant, tournament) => `新报名：${entrant}，${tournament}`,
    heading: '新报名',
    body: (entrant, tournament) => `${entrant} 已报名参加“${tournament}”。`,
    action: '查看报名',
  },
  squadSubmitted: {
    subject: (team, tournament) => `已提交名单：${team}，${tournament}`,
    heading: '已提交名单',
    body: (team, tournament) => `${team} 已为“${tournament}”提交名单。`,
    members: (count) => `名单成员数：${count}`,
    action: '查看报名',
  },
  invitation: {
    subject: 'CopaLibre 邀请',
    heading: '您已被邀请加入 CopaLibre。',
    body: '请使用下方链接接受邀请。',
    action: '接受邀请',
    expires: (at) => `此邀请将于 ${at} 过期。`,
  },
  passwordReset: {
    subject: 'CopaLibre 密码重置',
    heading: '有人请求重置您的 CopaLibre 账户密码。',
    body: '请使用下方链接设置新密码。',
    action: '重置密码',
    expires: (at) => `此链接将于 ${at} 过期。`,
    ignore: '如果这不是您的操作，请忽略此邮件。',
  },
};

const COPY: Readonly<Record<SupportedLanguage, EmailCopy>> = { en, es, fr, pt, it, de, ru, zh };

export function emailCopy(language: SupportedLanguage): EmailCopy {
  return COPY[language];
}
