import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Matches `reports.controller.ts`'s established upload request shape. */
export class UploadImageRequest {
  @ApiProperty()
  filename!: string;
  @ApiProperty()
  contentType!: string;
  @ApiProperty({ description: 'Base64-encoded file content' })
  contentBase64!: string;
}

export class UploadImageResponse {
  @ApiProperty({ format: 'uuid', description: 'object_metadata.object_id of the stored image' })
  objectId!: string;
}

export class SetPersonNationalityRequest {
  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code; omitted or null clears it.',
    example: 'AR',
    nullable: true,
  })
  nationality?: string | null;
}

export class PersonNationalityResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code, or null when cleared.',
    example: 'AR',
    nullable: true,
  })
  nationality!: string | null;
}
