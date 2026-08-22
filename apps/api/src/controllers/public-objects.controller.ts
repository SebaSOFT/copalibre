import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { DisciplineDescriptor } from '@copalibre/domain';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import type { Database } from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { NotFoundException } from '../http/error-contract.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';

@ApiTags('Public objects')
@Controller('objects')
export class PublicObjectsController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Get('discipline-background-image')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Stream an installed discipline background image' })
  @ApiQuery({ name: 'key', required: true })
  @ApiOkResponse({
    description: 'JPEG image bytes',
    content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
  })
  async disciplineBackgroundImage(
    @Query('key') key: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const rows = await this.db.selectFrom('discipline_descriptors').select('document').execute();
    const referenced = rows.some((row) => {
      const descriptor = (
        typeof row.document === 'string' ? JSON.parse(row.document) : row.document
      ) as DisciplineDescriptor;
      return descriptor.images?.some((reference) => reference.key === key) ?? false;
    });
    if (!referenced) throw backgroundNotFound();

    try {
      const stored = await this.storage.get({ key });
      reply.header('Content-Type', stored.contentType ?? 'image/jpeg');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return Buffer.from(stored.body);
    } catch {
      throw backgroundNotFound();
    }
  }
}

function backgroundNotFound(): NotFoundException {
  return new NotFoundException('No such discipline background image', {
    errorCode: 'discipline-background-image-not-found',
  });
}
