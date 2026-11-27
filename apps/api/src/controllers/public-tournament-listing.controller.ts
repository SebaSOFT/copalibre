import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { Database } from '@copalibre/persistence';
import { PublicOrganizationTournamentListResponse } from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { listTournaments } from '../public-projections/listing.js';

@ApiTags('Public Projections')
@Controller('organizations/:organizationAlias/public/tournaments')
export class PublicTournamentListingController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'List published tournaments for an organization' })
  @ApiOkResponse({ type: PublicOrganizationTournamentListResponse })
  async listTournaments(
    @Param('organizationAlias') organizationAlias: string,
  ): Promise<PublicOrganizationTournamentListResponse> {
    return listTournaments(this.db, organizationAlias);
  }
}
