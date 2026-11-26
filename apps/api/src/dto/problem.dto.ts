import { ApiProperty } from '@nestjs/swagger';

export class ProblemResponse {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'subject may only act on their own records' })
  message!: string;

  @ApiProperty({ example: 'forbidden' })
  errorCode!: string;
}
