import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { InstallModuleRequest, StatisticsRebuildRequest } from './admin.dto.js';
import {
  AcceptInvitationRequest,
  BootstrapAdministratorRequest,
  CreateOrganizationRequest,
  CreateTournamentRequest,
} from './organization.dto.js';
import { IssueDisplayTokenRequest } from './broadcast.dto.js';
import { UploadImageRequest } from './identity-media.dto.js';
import {
  ClockAdjustmentRequest,
  RecordEventRequest,
  SetMatchRosterRequest,
} from './match-control.dto.js';
import { ReviewReportRequest, SubmitReportRequest } from './reports.dto.js';
import { CreateOfficialRequest } from './resources.dto.js';
import { ScheduleRequest } from './schedule.dto.js';
import { PublishSeedingRequest } from './standings.dto.js';
import { DrawZonesRequest } from './zones-groups.dto.js';
import { ForgotPasswordRequest, LoginRequest, ResetPasswordRequest } from './auth.dto.js';

/**
 * One representative request-body DTO per DTO file (0146 task 5.1): a request
 * missing a required field must produce exactly one validation constraint on
 * that field, proving the class-validator rules are attached and the global
 * pipe will turn what used to be a 500 into a clean 400.
 */
const REQUEST_DTOS_WITH_REQUIRED_FIELDS: ReadonlyArray<{
  readonly name: string;
  readonly cls: new () => object;
  readonly sample: Record<string, unknown>;
  readonly requiredField: string;
}> = [
  { name: 'InstallModuleRequest', cls: InstallModuleRequest, sample: {}, requiredField: 'alias' },
  {
    name: 'StatisticsRebuildRequest',
    cls: StatisticsRebuildRequest,
    sample: {},
    requiredField: '',
  },
  {
    name: 'LoginRequest',
    cls: LoginRequest,
    sample: { email: 'a@b.c' },
    requiredField: 'password',
  },
  { name: 'ForgotPasswordRequest', cls: ForgotPasswordRequest, sample: {}, requiredField: 'email' },
  {
    name: 'ResetPasswordRequest',
    cls: ResetPasswordRequest,
    sample: { token: 't' },
    requiredField: 'newPassword',
  },
  {
    name: 'IssueDisplayTokenRequest',
    cls: IssueDisplayTokenRequest,
    sample: {},
    requiredField: '',
  },
  {
    name: 'UploadImageRequest',
    cls: UploadImageRequest,
    sample: { filename: 'p.png', contentType: 'image/png' },
    requiredField: 'contentBase64',
  },
  {
    name: 'ClockAdjustmentRequest',
    cls: ClockAdjustmentRequest,
    sample: {},
    requiredField: 'segmentId',
  },
  {
    name: 'RecordEventRequest',
    cls: RecordEventRequest,
    sample: { definitionCode: 'goal', segmentId: 's', occurredAt: 1 },
    requiredField: '',
  },
  {
    name: 'SetMatchRosterRequest',
    cls: SetMatchRosterRequest,
    sample: {},
    requiredField: '',
  },
  {
    name: 'AcceptInvitationRequest',
    cls: AcceptInvitationRequest,
    sample: {},
    requiredField: 'token',
  },
  {
    name: 'BootstrapAdministratorRequest',
    cls: BootstrapAdministratorRequest,
    sample: { organizationAlias: 'a', organizationName: 'A' },
    requiredField: 'email',
  },
  {
    name: 'CreateOrganizationRequest',
    cls: CreateOrganizationRequest,
    sample: { alias: 'a' },
    requiredField: 'name',
  },
  {
    name: 'CreateTournamentRequest',
    cls: CreateTournamentRequest,
    sample: {},
    requiredField: 'alias',
  },
  {
    name: 'SubmitReportRequest',
    cls: SubmitReportRequest,
    sample: {},
    requiredField: 'proposedResult',
  },
  { name: 'ReviewReportRequest', cls: ReviewReportRequest, sample: {}, requiredField: 'status' },
  {
    name: 'CreateOfficialRequest',
    cls: CreateOfficialRequest,
    sample: { displayName: 'X' },
    requiredField: 'roles',
  },
  { name: 'ScheduleRequest', cls: ScheduleRequest, sample: {}, requiredField: 'assignments' },
  {
    name: 'PublishSeedingRequest',
    cls: PublishSeedingRequest,
    sample: {},
    requiredField: '',
  },
  { name: 'DrawZonesRequest', cls: DrawZonesRequest, sample: {}, requiredField: 'zoneCount' },
];

function constraintsOn(errors: readonly ValidationError[], field: string): number {
  return errors.filter((error) => error.property === field && error.constraints).length;
}

describe('request-body DTO validation rules', () => {
  it('flags a missing required field on every decorated request DTO', async () => {
    const failures: string[] = [];
    for (const entry of REQUEST_DTOS_WITH_REQUIRED_FIELDS) {
      if (entry.requiredField === '') continue;
      const errors = await validate(plainToInstance(entry.cls, entry.sample));
      if (constraintsOn(errors, entry.requiredField) === 0) {
        failures.push(
          `${entry.name}.${entry.requiredField}: ${JSON.stringify(errors.map((e) => e.constraints))}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('leaves DTOs with only optional fields validating cleanly when empty', async () => {
    for (const entry of REQUEST_DTOS_WITH_REQUIRED_FIELDS.filter((e) => e.requiredField === '')) {
      const errors = await validate(plainToInstance(entry.cls, entry.sample));
      const messages = errors.map((error) => JSON.stringify(error.constraints)).join('; ');
      expect(`${entry.name}: ${messages}`).toBe(`${entry.name}: `);
    }
  });

  it('accepts fully populated payloads for representative DTOs', async () => {
    const login = await validate(
      plainToInstance(LoginRequest, { email: 'a@b.c', password: 'secret123' }),
    );
    expect(login).toHaveLength(0);

    const clock = await validate(
      plainToInstance(ClockAdjustmentRequest, { segmentId: 'seg-1', elapsedSeconds: 90 }),
    );
    expect(clock).toHaveLength(0);
  });
});
