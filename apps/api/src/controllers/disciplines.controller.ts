import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Controller, Inject, Get } from '@nestjs/common';
import { DATABASE } from '../database.token.js';
import type { Kysely } from 'kysely';
import { type Database, TournamentRepository } from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DisciplineSummaryResponse } from '../dto/organization.dto.js';
import { SUPPORTED_FORMATS } from '@copalibre/domain';

/** The disciplines a wizard may choose from, with the formats each declares. */
@ApiTags('disciplines')
@Controller('disciplines')
export class DisciplinesController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'List installed disciplines and the formats they support',
    description:
      'The wizard filters formats from this response. A client-side list disagrees with the installation the day a module is added.',
  })
  @ApiOkResponse({ type: DisciplineSummaryResponse, isArray: true })
  async list(): Promise<DisciplineSummaryResponse[]> {
    const descriptors = await new TournamentRepository(this.db).listDescriptors();

    return descriptors.map((descriptor) => ({
      descriptorId: descriptor.descriptorId,
      alias: descriptor.document.alias,
      version: descriptor.version,
      name: descriptor.document.name,
      description: descriptor.document.description,
      // The descriptor's own list, filtered to what the engine actually supports:
      // a discipline may not advertise a format nothing can generate.
      supportedFormats: descriptor.document.availableFormats.filter((format) =>
        (SUPPORTED_FORMATS as readonly string[]).includes(format),
      ),
      ...(descriptor.document.formatDescriptions === undefined
        ? {}
        : { formatDescriptions: descriptor.document.formatDescriptions }),
      fieldPolicies: descriptor.document.fieldPolicies,
      defaults: descriptor.document.defaults,
    }));
  }
}
