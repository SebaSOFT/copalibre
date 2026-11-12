import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import sharp from 'sharp';
import { imageContentType, safeObjectName } from '../http/upload-names.js';
import {
  EMBLEM_RENDITION_CONTENT_TYPE,
  EMBLEM_RENDITION_WIDTHS,
  emblemRenditionKey,
  hasEmblemRenditions,
  isEmblemRenditionWidth,
  renderEmblemRendition,
  type EmblemRenditionWidth,
  type ObjectStorageAdapter,
} from '@copalibre/object-storage';
import type { Tournament } from '@copalibre/domain';
import {
  EnrollmentRepository,
  ObjectMetadataRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
  type ObjectMetadata,
} from '@copalibre/persistence';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  RESOURCE_THROTTLE_LIMIT,
  RESOURCE_THROTTLE_TTL_MS,
} from '../auth/principal-throttler.guard.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { SharedThrottle } from '../auth/shared-throttle.decorator.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import {
  DeleteEmblemResponse,
  PersonPublicVisibilityResponse,
  PersonNationalityResponse,
  PersonResponse,
  SetPersonPublicVisibilityRequest,
  SetPersonNationalityRequest,
  UploadImageRequest,
  UploadImageResponse,
} from '../dto/identity-media.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { recordSensitiveRead } from '../http/sensitive-read-audit.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Person photo and club emblem upload/serve.
 *
 * Person and club images resolve their stored object reference server-side.
 * Tournament-scoped public person-photo requests apply that tournament's
 * youth visibility settings before returning the bytes.
 */
@ApiTags('persons')
@Controller('organizations/:organizationAlias/persons/:personId')
export class PersonMediaController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-persons')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read a person’s profile (display name, nationality, photo, natural key)',
  })
  @ApiOkResponse({ type: PersonResponse })
  async getPerson(
    @Param('organizationAlias') organizationAlias: string,
    @Param('personId') personId: string,
    @Req() request: RequestWithSubject,
  ): Promise<PersonResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (!person || person.organizationId !== organizationId) {
      throw new NotFoundException(`No person "${personId}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }
    await recordSensitiveRead(this.db, {
      organizationId,
      entityType: 'person',
      entityId: personId,
      action: 'person.profile-read',
      subject: request.subject,
    });
    return {
      personId: person.personId,
      displayName: person.displayName,
      ...(person.nationality === undefined ? {} : { nationality: person.nationality }),
      ...(person.photoObjectId === undefined ? {} : { photoObjectId: person.photoObjectId }),
      ...(person.naturalKey === undefined ? {} : { naturalKey: person.naturalKey }),
      hiddenFromPublic: person.hiddenFromPublic ?? false,
    };
  }

  @Post('photo')
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-persons')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload a person's photo (must be exactly 410×512px, ±1%)" })
  @ApiCreatedResponse({ type: UploadImageResponse })
  async uploadPhoto(
    @Param('organizationAlias') organizationAlias: string,
    @Param('personId') personId: string,
    @Body() body: UploadImageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<UploadImageResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (!person || person.organizationId !== organizationId) {
      throw new NotFoundException(`No person "${personId}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }

    const { bytes, contentType, name } = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/persons/${personId}/${newId()}-${name}`,
      bytes,
      contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType,
        sizeBytes: bytes.length,
        uploadedBy: actor,
      });
      await new PersonRepository(this.db).setPhoto(uow, {
        personId,
        organizationId,
        photoObjectId: objectMetadata.objectId,
        actor,
        authorizationContext: 'copalibre.control',
      });
      return objectMetadata.objectId;
    });

    return { objectId };
  }

  @Get('photo')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "Stream a person's photo when a public tournament allows it" })
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async servePhoto(
    @Param('organizationAlias') organizationAlias: string,
    @Param('personId') personId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException('No public photo for this person', {
        errorCode: 'identity-media-not-found',
      });
    }
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (
      !person ||
      person.organizationId !== organization.organizationId ||
      person.hiddenFromPublic === true ||
      !person.photoObjectId
    ) {
      throw new NotFoundException('No public photo for this person', {
        errorCode: 'identity-media-not-found',
      });
    }
    const publicTeamEntry = await this.db
      .selectFrom('players')
      .innerJoin('teams', 'teams.team_id', 'players.team_id')
      .innerJoin('entrants', 'entrants.team_id', 'teams.team_id')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'entrants.tournament_id')
      .select('tournaments.tournament_id')
      .where('players.person_id', '=', personId)
      .where('tournaments.organization_id', '=', organization.organizationId)
      .where('tournaments.status', '!=', 'draft')
      .where((eb) =>
        eb.or([
          eb('tournaments.includes_minors', '=', false),
          eb('tournaments.show_youth_profiles', '=', true),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    const publicIndividualEntry = await this.db
      .selectFrom('entrants')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'entrants.tournament_id')
      .select('tournaments.tournament_id')
      .where('entrants.person_id', '=', personId)
      .where('tournaments.organization_id', '=', organization.organizationId)
      .where('tournaments.status', '!=', 'draft')
      .where((eb) =>
        eb.or([
          eb('tournaments.includes_minors', '=', false),
          eb('tournaments.show_youth_profiles', '=', true),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    if (!publicTeamEntry && !publicIndividualEntry) {
      throw new NotFoundException('No public photo for this person', {
        errorCode: 'identity-media-not-found',
      });
    }
    return streamStoredObject(this.db, this.storage, person.photoObjectId, reply);
  }

  @Patch('nationality')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-persons')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Set or clear a person's nationality" })
  @ApiOkResponse({ type: PersonNationalityResponse })
  async setNationality(
    @Param('organizationAlias') organizationAlias: string,
    @Param('personId') personId: string,
    @Body() body: SetPersonNationalityRequest,
    @Req() request: RequestWithSubject,
  ): Promise<PersonNationalityResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (!person || person.organizationId !== organizationId) {
      throw new NotFoundException(`No person "${personId}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }

    const updated = await withTransaction(this.db, (uow) =>
      new PersonRepository(this.db).setNationality(uow, {
        personId,
        organizationId,
        nationality: body.nationality ?? null,
        actor: actorOf(request),
        authorizationContext: 'copalibre.control',
      }),
    );
    return { personId: updated.personId, nationality: updated.nationality ?? null };
  }

  @Patch('public-visibility')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-persons')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set whether a person is hidden from public pages' })
  @ApiOkResponse({ type: PersonPublicVisibilityResponse })
  async setPublicVisibility(
    @Param('organizationAlias') organizationAlias: string,
    @Param('personId') personId: string,
    @Body() body: SetPersonPublicVisibilityRequest,
    @Req() request: RequestWithSubject,
  ): Promise<PersonPublicVisibilityResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (!person || person.organizationId !== organizationId) {
      throw new NotFoundException(`No person "${personId}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }

    const updated = await withTransaction(this.db, (uow) =>
      new PersonRepository(this.db).setHiddenFromPublic(uow, {
        personId,
        organizationId,
        hiddenFromPublic: body.hiddenFromPublic,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    );
    return {
      personId: updated.personId,
      hiddenFromPublic: updated.hiddenFromPublic ?? false,
    };
  }
}

@ApiTags('clubs')
@Controller('organizations/:organizationAlias/clubs/:clubId')
export class ClubMediaController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Post('emblem')
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-clubs')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload a club's emblem (must be exactly 410×512px, ±1%)" })
  @ApiCreatedResponse({ type: UploadImageResponse })
  async uploadEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Body() body: UploadImageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<UploadImageResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const club = await new EnrollmentRepository(this.db).findClub(clubId);
    if (!club || club.organizationId !== organizationId) {
      throw new NotFoundException(`No club "${clubId}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId, ownerClubId: clubId },
    });

    const { bytes, contentType, name } = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/clubs/${clubId}/${newId()}-${name}`,
      bytes,
      contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType,
        sizeBytes: bytes.length,
        uploadedBy: actor,
      });
      await new EnrollmentRepository(this.db).updateClub(uow, {
        clubId,
        organizationId,
        emblemObjectId: objectMetadata.objectId,
        actor,
        authorizationContext: 'copalibre.control',
      });
      return objectMetadata.objectId;
    });

    return { objectId };
  }

  @Get('emblem')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "Stream a club's emblem, once it has passed validation" })
  @EmblemWidthQuery()
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async serveEmblem(
    @Param('clubId') clubId: string,
    @Query('width') width: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const renditionWidth = parseEmblemWidth(width);
    const club = await new EnrollmentRepository(this.db).findClub(clubId);
    if (!club?.emblemObjectId)
      throw new NotFoundException('No emblem for this club', {
        errorCode: 'identity-media-not-found',
      });
    return streamEmblem(this.db, this.storage, club.emblemObjectId, renditionWidth, reply);
  }
}

@ApiTags('organizations')
@Controller('organizations/:organizationAlias')
export class OrganizationMediaController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Post('emblem')
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-settings')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload an organization's emblem (must be exactly 410×512px, ±1%)" })
  @ApiCreatedResponse({ type: UploadImageResponse })
  async uploadEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: UploadImageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<UploadImageResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);

    const { bytes, contentType, name } = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/emblem/${newId()}-${name}`,
      bytes,
      contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType,
        sizeBytes: bytes.length,
        uploadedBy: actor,
      });
      await new OrganizationRepository(this.db).updateSettings(uow, organizationId, {
        emblemObjectId: objectMetadata.objectId,
        actor,
        authorizationContext: 'copalibre.control',
      });
      return objectMetadata.objectId;
    });

    return { objectId };
  }

  @Get('emblem')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "Stream an organization's emblem, once it has passed validation" })
  @EmblemWidthQuery()
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async serveEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Query('width') width: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const renditionWidth = parseEmblemWidth(width);
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'identity-media-not-found',
      });
    }
    if (!organization.emblemObjectId)
      throw new NotFoundException('No emblem for this organization', {
        errorCode: 'identity-media-not-found',
      });
    return streamEmblem(this.db, this.storage, organization.emblemObjectId, renditionWidth, reply);
  }
}

@ApiTags('tournaments')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias')
export class TournamentMediaController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Get('persons/:personId/photo')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "Stream a player's photo when public tournament settings allow it" })
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async servePublicPersonPhoto(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (
      !tournament ||
      tournament.status === 'draft' ||
      (tournament.includesMinors === true && tournament.showYouthProfiles !== true)
    ) {
      throw new NotFoundException('No public photo in this tournament', {
        errorCode: 'identity-media-not-found',
      });
    }
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (
      !person ||
      person.organizationId !== tournament.organizationId ||
      person.hiddenFromPublic === true ||
      !person.photoObjectId
    ) {
      throw new NotFoundException('No public photo in this tournament', {
        errorCode: 'identity-media-not-found',
      });
    }
    return streamStoredObject(this.db, this.storage, person.photoObjectId, reply);
  }

  @Post('emblem')
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload a tournament's emblem (must be exactly 410×512px, ±1%)" })
  @ApiCreatedResponse({ type: UploadImageResponse })
  async uploadEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: UploadImageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<UploadImageResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const tournament = await resolveTournament(
      this.db,
      organizationId,
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) {
      throw new NotFoundException(`No tournament "${tournamentAlias}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId },
    });

    const { bytes, contentType, name } = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/tournaments/${tournament.tournamentId}/${newId()}-${name}`,
      bytes,
      contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType,
        sizeBytes: bytes.length,
        uploadedBy: actor,
      });
      await new TournamentRepository(this.db).updateEmblem(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        emblemObjectId: objectMetadata.objectId,
        actor,
        authorizationContext: 'copalibre.control',
      });
      return objectMetadata.objectId;
    });

    return { objectId };
  }

  @Get('emblem')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "Stream a tournament's emblem, once it has passed validation" })
  @EmblemWidthQuery()
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async serveEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Query('width') width: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const renditionWidth = parseEmblemWidth(width);
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    const organizationId = organization?.organizationId;
    const tournament = organizationId
      ? await resolveTournament(this.db, organizationId, organizationAlias, tournamentAlias)
      : undefined;
    if (!tournament?.emblemObjectId) {
      throw new NotFoundException('No emblem for this tournament', {
        errorCode: 'identity-media-not-found',
      });
    }
    return streamEmblem(this.db, this.storage, tournament.emblemObjectId, renditionWidth, reply);
  }

  @Delete('emblem')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a tournament's emblem" })
  @ApiOkResponse({ type: DeleteEmblemResponse, description: 'Tournament emblem removed' })
  async deleteEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<DeleteEmblemResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const tournament = await resolveTournament(
      this.db,
      organizationId,
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) {
      throw new NotFoundException(`No tournament "${tournamentAlias}" in this organization`, {
        errorCode: 'identity-media-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId },
    });

    if (!tournament.emblemObjectId) {
      throw new NotFoundException('No emblem for this tournament', {
        errorCode: 'identity-media-not-found',
      });
    }

    const previousObjectId = tournament.emblemObjectId;
    const actor = actorOf(request);

    await withTransaction(this.db, async (uow) => {
      await new TournamentRepository(this.db).updateEmblem(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        emblemObjectId: null,
        actor,
        authorizationContext: 'copalibre.control',
      });
      const metadata = await new ObjectMetadataRepository(this.db).findById(previousObjectId);
      if (metadata) {
        await new ObjectMetadataRepository(this.db).delete(uow, previousObjectId, {
          organizationId,
          actor,
          authorizationContext: 'copalibre.control',
        });
      }
    });

    return { ok: true };
  }
}

async function resolveAdminOrganization(
  db: Kysely<Database>,
  organizationAlias: string,
  request: RequestWithSubject,
): Promise<string> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
      errorCode: 'identity-media-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: organization.organizationId },
  });
  return organization.organizationId;
}

async function resolveTournament(
  db: Kysely<Database>,
  organizationId: string,
  organizationAlias: string,
  tournamentAlias: string,
): Promise<Tournament | undefined> {
  const repo = new TournamentRepository(db);
  const byScoped = await repo.findByScopedAlias(organizationAlias, tournamentAlias);
  if (byScoped && byScoped.organizationId === organizationId) return byScoped;
  const byId = await repo.findById(tournamentAlias);
  if (byId && byId.organizationId === organizationId) return byId;
  return undefined;
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.subjectId ?? 'unknown'}`;
}

/**
 * Every profile image (organization emblem, club emblem, person photo) is
 * exactly this size on the wire — the client-side crop tool always
 * outputs it, so a mismatch here means a non-conforming client, not a
 * legitimate source photo that merely needs scaling.
 */
const REQUIRED_IMAGE_WIDTH = 410;
const REQUIRED_IMAGE_HEIGHT = 512;
const DIMENSION_TOLERANCE = 0.01;

function withinTolerance(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= expected * DIMENSION_TOLERANCE;
}

/**
 * Decodes an uploaded image and checks its size and dimensions. Its type comes
 * from the decoded format, not from the request: a PNG declared as text/html
 * is stored and served as image/png, and a format uploads do not accept
 * (TIFF, PDF) is refused.
 */
async function decodeImage(
  upload: UploadImageRequest,
): Promise<{ readonly bytes: Buffer; readonly contentType: string; readonly name: string }> {
  const name = safeObjectName(upload.filename);
  const bytes = Buffer.from(upload.contentBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new BadRequestException(
      `Image "${name}" is not a valid size (0 < bytes <= ${MAX_IMAGE_BYTES})`,
      { errorCode: 'identity-media-bad-request' },
    );
  }

  const metadata = await sharp(bytes)
    .metadata()
    .catch(() => ({ width: undefined, height: undefined, format: undefined }));
  const { width, height } = metadata;
  const contentType = imageContentType(metadata.format);
  if (contentType === undefined) {
    throw new BadRequestException(
      `Image "${name}" is not an SVG, PNG, JPEG, WebP, GIF or AVIF image`,
      {
        errorCode: 'identity-media-bad-request',
      },
    );
  }
  if (
    width === undefined ||
    height === undefined ||
    !withinTolerance(width, REQUIRED_IMAGE_WIDTH) ||
    !withinTolerance(height, REQUIRED_IMAGE_HEIGHT)
  ) {
    throw new BadRequestException(
      `Image "${name}" must be ${REQUIRED_IMAGE_WIDTH}×${REQUIRED_IMAGE_HEIGHT} ` +
        `(within ${DIMENSION_TOLERANCE * 100}% tolerance); received ${width ?? '?'}×${height ?? '?'}`,
      { errorCode: 'identity-media-bad-request' },
    );
  }
  return { bytes, contentType, name };
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Declares the optional rendition width on an emblem route in the OpenAPI document. */
function EmblemWidthQuery(): MethodDecorator {
  return ApiQuery({
    name: 'width',
    required: false,
    enum: [...EMBLEM_RENDITION_WIDTHS],
    description:
      'Serve a WebP rendition of this width instead of the stored original. ' +
      'SVG and GIF emblems are always served as stored.',
  });
}

/** `undefined` asks for the original; any value outside the fixed list is refused before anything is read or stored. */
function parseEmblemWidth(width: string | undefined): EmblemRenditionWidth | undefined {
  if (width === undefined) return undefined;
  const parsed = /^\d+$/.test(width) ? Number(width) : Number.NaN;
  if (!isEmblemRenditionWidth(parsed)) {
    throw new BadRequestException(
      `Emblem width must be one of ${EMBLEM_RENDITION_WIDTHS.join(', ')}; received "${width}"`,
      { errorCode: 'identity-media-bad-request' },
    );
  }
  return parsed;
}

/**
 * Resolves an already-owned `ObjectMetadata` id to its metadata, answering
 * `pending` (202, no body, matching how a freshly-uploaded row sits until
 * `objectProcessingHandler` picks it up) and `failed` (404) itself.
 */
async function passedObject(
  db: Kysely<Database>,
  objectId: string,
  reply: FastifyReply,
): Promise<ObjectMetadata | undefined> {
  const metadata: ObjectMetadata | undefined = await new ObjectMetadataRepository(db).findById(
    objectId,
  );
  if (!metadata)
    throw new NotFoundException('No such stored object', { errorCode: 'identity-media-not-found' });
  if (metadata.status === 'failed')
    throw new NotFoundException('Object failed validation', {
      errorCode: 'identity-media-not-found',
    });
  if (metadata.status === 'pending') {
    reply.status(202);
    return undefined;
  }
  return metadata;
}

/** `passed` objects stream through the adapter with a long-lived cache header. */
async function streamStoredObject(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter,
  objectId: string,
  reply: FastifyReply,
): Promise<Buffer | undefined> {
  const metadata = await passedObject(db, objectId, reply);
  return metadata ? sendOriginal(storage, metadata, reply) : undefined;
}

async function sendOriginal(
  storage: ObjectStorageAdapter,
  metadata: ObjectMetadata,
  reply: FastifyReply,
): Promise<Buffer> {
  const stored = await storage.get({ key: metadata.storageKey });
  reply.header('Content-Type', stored.contentType ?? metadata.contentType);
  reply.header('Cache-Control', IMMUTABLE_CACHE);
  return Buffer.from(stored.body);
}

/**
 * An emblem at the asked width. The original stays the only source of truth:
 * a rendition is read from storage when the worker (or an earlier request)
 * made it, and otherwise rendered once from the original, stored and served.
 * The work is bounded by the fixed widths and the fixed upload size.
 */
async function streamEmblem(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter,
  objectId: string,
  width: EmblemRenditionWidth | undefined,
  reply: FastifyReply,
): Promise<Buffer | undefined> {
  const metadata = await passedObject(db, objectId, reply);
  if (!metadata) return undefined;
  if (width === undefined || !hasEmblemRenditions(metadata.contentType)) {
    return sendOriginal(storage, metadata, reply);
  }

  const key = emblemRenditionKey(metadata.storageKey, width);
  const body = await storage.get({ key }).then(
    (stored) => Buffer.from(stored.body),
    async () => {
      const original = await storage.get({ key: metadata.storageKey });
      const rendition = await renderEmblemRendition(original.body, width);
      // Two first requests may both render; they write the same bytes to the same key.
      await storage.put(key, rendition, EMBLEM_RENDITION_CONTENT_TYPE);
      return rendition;
    },
  );
  reply.header('Content-Type', EMBLEM_RENDITION_CONTENT_TYPE);
  reply.header('Cache-Control', IMMUTABLE_CACHE);
  return body;
}
