import { Body, Controller, Get, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import sharp from 'sharp';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  EnrollmentRepository,
  ObjectMetadataRepository,
  OrganizationRepository,
  PersonRepository,
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
  PersonNationalityResponse,
  PersonResponse,
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
 * The upload routes are `admin-control`, matching how a person/club is
 * already edited. The serve routes are deliberately `public-read`, unlike
 * `reports.controller.ts`'s evidence: these are spectator-facing images
 * ("distinct from... every other stored object"), not
 * report evidence, so they carry no organization membership or capability
 * check. Each serve route resolves its own entity's stored reference
 * server-side rather than accepting an arbitrary object id, which is what
 * keeps this narrower than a generic `GET /objects/:objectId` reader would
 * be (design.md Decision 2).
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

    const bytes = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/persons/${personId}/${newId()}-${body.filename}`,
      bytes,
      body.contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType: body.contentType,
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
  @ApiOperation({ summary: "Stream a person's photo, once it has passed validation" })
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async servePhoto(
    @Param('personId') personId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const person = await new PersonRepository(this.db).findPerson(personId);
    if (!person?.photoObjectId)
      throw new NotFoundException('No photo for this person', {
        errorCode: 'identity-media-not-found',
      });
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

    const bytes = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/clubs/${clubId}/${newId()}-${body.filename}`,
      bytes,
      body.contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType: body.contentType,
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
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async serveEmblem(
    @Param('clubId') clubId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
    const club = await new EnrollmentRepository(this.db).findClub(clubId);
    if (!club?.emblemObjectId)
      throw new NotFoundException('No emblem for this club', {
        errorCode: 'identity-media-not-found',
      });
    return streamStoredObject(this.db, this.storage, club.emblemObjectId, reply);
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

    const bytes = await decodeImage(body);
    const reference = await this.storage.put(
      `${organizationId}/emblem/${newId()}-${body.filename}`,
      bytes,
      body.contentType,
    );
    const actor = actorOf(request);

    const objectId = await withTransaction(this.db, async (uow) => {
      const objectMetadata = await new ObjectMetadataRepository(this.db).save(uow, {
        organizationId,
        profile: this.storage.profile,
        storageKey: reference.key,
        contentType: body.contentType,
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
  @ApiOkResponse({ description: 'Image bytes', schema: { type: 'string', format: 'binary' } })
  async serveEmblem(
    @Param('organizationAlias') organizationAlias: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | undefined> {
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
    return streamStoredObject(this.db, this.storage, organization.emblemObjectId, reply);
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

async function decodeImage(upload: UploadImageRequest): Promise<Buffer> {
  const bytes = Buffer.from(upload.contentBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new BadRequestException(
      `Image "${upload.filename}" is not a valid size (0 < bytes <= ${MAX_IMAGE_BYTES})`,
      { errorCode: 'identity-media-bad-request' },
    );
  }

  const dimensions = await sharp(bytes)
    .metadata()
    .catch(() => ({ width: undefined, height: undefined }));
  const { width, height } = dimensions;
  if (
    width === undefined ||
    height === undefined ||
    !withinTolerance(width, REQUIRED_IMAGE_WIDTH) ||
    !withinTolerance(height, REQUIRED_IMAGE_HEIGHT)
  ) {
    throw new BadRequestException(
      `Image "${upload.filename}" must be ${REQUIRED_IMAGE_WIDTH}×${REQUIRED_IMAGE_HEIGHT} ` +
        `(within ${DIMENSION_TOLERANCE * 100}% tolerance); received ${width ?? '?'}×${height ?? '?'}`,
      { errorCode: 'identity-media-bad-request' },
    );
  }
  return bytes;
}

/**
 * Resolves an already-owned `ObjectMetadata` id to bytes on the wire —
 * `pending` polls (202, no body, matching how a freshly-uploaded row sits
 * until `objectProcessingHandler` picks it up), `failed` never serves
 * (404), `passed` streams through the adapter with a long-lived cache
 * header (design.md Decision 2).
 */
async function streamStoredObject(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter,
  objectId: string,
  reply: FastifyReply,
): Promise<Buffer | undefined> {
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

  const stored = await storage.get({ key: metadata.storageKey });
  reply.header('Content-Type', stored.contentType ?? metadata.contentType);
  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  return Buffer.from(stored.body);
}
