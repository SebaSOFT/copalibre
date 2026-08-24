import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { bindCapabilities } from '@copalibre/domain';
import {
  TournamentProfileRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { TournamentProfileSummaryResponse } from '../dto/organization.dto.js';
import { DATABASE } from '../database.token.js';

/**
 * Tournament profile routes for authoring and discovery.
 */
@ApiTags('tournament-profiles')
@Controller('tournament-profiles')
export class TournamentProfilesController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('compatible')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'List installed profiles compatible with a discipline and format',
    description:
      'Queries installed tournament profiles whose capability requirements are satisfied by the given descriptor and whose declared stages are supported.',
  })
  @ApiQuery({
    name: 'descriptorId',
    required: true,
    description: 'DisciplineDescriptor identifier',
  })
  @ApiQuery({
    name: 'descriptorVersion',
    required: true,
    description: 'DisciplineDescriptor version',
  })
  @ApiQuery({ name: 'format', required: false, description: 'Optional format filter' })
  @ApiOkResponse({ type: TournamentProfileSummaryResponse, isArray: true })
  async listCompatible(
    @Query('descriptorId') descriptorId: string,
    @Query('descriptorVersion') descriptorVersion: string,
    @Query('format') format?: string,
  ): Promise<TournamentProfileSummaryResponse[]> {
    if (!descriptorId || !descriptorVersion) {
      throw new BadRequestException(
        'descriptorId and descriptorVersion are required query parameters',
        {
          errorCode: 'tournament-bad-request',
        },
      );
    }

    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      descriptorId,
      descriptorVersion,
    );
    if (!descriptor) {
      throw new NotFoundException(
        `No discipline descriptor found for ${descriptorId}@${descriptorVersion}`,
        { errorCode: 'descriptor-not-found' },
      );
    }

    const profiles = await new TournamentProfileRepository(this.db).listProfiles();

    const compatible = profiles.filter((p) => {
      const binding = bindCapabilities(descriptor, p.document);
      if (!binding.ok) return false;

      const stageFormatsValid = p.document.stages.every((stage) =>
        descriptor.availableFormats.includes(stage.format),
      );
      if (!stageFormatsValid) return false;

      if (format !== undefined && format.trim() !== '') {
        return p.document.stages.some((stage) => stage.format === format);
      }
      return true;
    });

    return compatible.map((p) => ({
      profileId: p.profileId,
      alias: p.document.alias,
      version: p.version,
      name: p.document.name,
      description: p.document.description,
      stages: p.document.stages.map((stage) => ({
        number: stage.number,
        name: stage.name,
        format: stage.format,
      })),
    }));
  }
}
