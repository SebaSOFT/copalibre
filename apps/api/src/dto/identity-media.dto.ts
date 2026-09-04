import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Matches `reports.controller.ts`'s established upload request shape. */
export class UploadImageRequest {
  @ApiProperty()
  @IsString()
  filename!: string;
  @ApiProperty()
  @IsString()
  contentType!: string;
  @ApiProperty({ description: 'Base64-encoded file content' })
  @IsString()
  contentBase64!: string;
}

export class UploadImageResponse {
  @ApiProperty({ format: 'uuid', description: 'object_metadata.object_id of the stored image' })
  objectId!: string;
}

export class DeleteEmblemResponse {
  @ApiProperty({ example: true })
  ok!: boolean;
}

export class SetPersonNationalityRequest {
  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country code; omitted or null clears it.',
    example: 'AR',
    nullable: true,
  })
  @IsOptional()
  @IsString()
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

export class NaturalKeyResponse {
  @ApiProperty({ example: 'dni' })
  kind!: string;

  @ApiProperty()
  value!: string;
}

export class PersonResponse {
  @ApiProperty({ format: 'uuid' })
  personId!: string;

  @ApiProperty({ example: 'Elías Salomón' })
  displayName!: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', example: 'AR' })
  nationality?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'object_metadata.object_id of the photo' })
  photoObjectId?: string;

  @ApiPropertyOptional({ type: NaturalKeyResponse })
  naturalKey?: NaturalKeyResponse;
}
