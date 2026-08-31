import { IsInt, IsOptional, IsString, ValidateNested, type ValidationError } from 'class-validator';
import { Type } from 'class-transformer';
import {
  createApiValidationPipe,
  extractUndeclaredProperties,
  formatValidationMessages,
  logUndeclaredPropertiesObservation,
} from './validation.js';

class NestedDto {
  @IsString()
  key!: string;
}

class SampleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  count?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => NestedDto)
  nested?: NestedDto;
}

describe('API request validation pipe & observation', () => {
  it('creates a validation pipe that accepts valid payload shapes', async () => {
    const pipe = createApiValidationPipe();
    const result = await pipe.transform(
      { name: 'valid-name', count: 5, nested: { key: 'nested-val' } },
      { type: 'body', metatype: SampleDto },
    );
    expect(result).toBeInstanceOf(SampleDto);
    expect(result.name).toBe('valid-name');
    expect(result.count).toBe(5);
    expect(result.nested?.key).toBe('nested-val');
  });

  it('rejects undeclared root properties with 400 and constraint message', async () => {
    const pipe = createApiValidationPipe();
    try {
      await pipe.transform(
        { name: 'valid-name', undeclaredField: 'malicious-or-typo-value' },
        { type: 'body', metatype: SampleDto },
      );
      throw new Error('Expected validation pipe to throw');
    } catch (error) {
      const err = error as { getStatus(): number; getResponse(): { message: string[] } };
      expect(err.getStatus()).toBe(400);
      const response = err.getResponse();
      expect(response.message).toContain('property undeclaredField should not exist');
    }
  });

  it('rejects undeclared nested properties with 400 and constraint message', async () => {
    const pipe = createApiValidationPipe();
    try {
      await pipe.transform(
        { name: 'valid-name', nested: { key: 'val', unexpectedChild: 123 } },
        { type: 'body', metatype: SampleDto },
      );
      throw new Error('Expected validation pipe to throw');
    } catch (error) {
      const err = error as { getStatus(): number; getResponse(): { message: string[] } };
      expect(err.getStatus()).toBe(400);
      const response = err.getResponse();
      expect(response.message).toContain('property unexpectedChild should not exist');
    }
  });

  it('preserves privacy in observation logging by recording only property names, not values or credentials', async () => {
    const logs: string[] = [];
    const mockLogger = {
      warn: (msg: string) => {
        logs.push(msg);
      },
    };

    const pipe = createApiValidationPipe({ logger: mockLogger });
    const secretPassword = 'SUPER_SECRET_PASSWORD_123';
    const secretToken = 'Bearer sensitive_token_xyz';

    await expect(
      pipe.transform(
        {
          name: 'valid-name',
          secretPasswordKey: secretPassword,
          authSecret: secretToken,
        },
        { type: 'body', metatype: SampleDto },
      ),
    ).rejects.toThrow();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('secretPasswordKey');
    expect(logs[0]).toContain('authSecret');
    expect(logs[0]).not.toContain(secretPassword);
    expect(logs[0]).not.toContain(secretToken);
  });

  it('extracts undeclared property paths recursively', () => {
    const errors = [
      {
        property: 'rootExtra',
        constraints: { isDefined: 'property rootExtra should not exist' },
      },
      {
        property: 'nested',
        children: [
          {
            property: 'childExtra',
            constraints: { isDefined: 'property childExtra should not exist' },
          },
        ],
      },
    ];

    const extracted = extractUndeclaredProperties(errors as unknown as readonly ValidationError[]);
    expect(extracted).toEqual(['rootExtra', 'nested.childExtra']);
  });

  it('formats validation constraint messages into a flat string list', () => {
    const errors = [
      {
        property: 'name',
        constraints: { isString: 'name must be a string' },
      },
      {
        property: 'nested',
        children: [
          {
            property: 'key',
            constraints: { isString: 'key must be a string' },
          },
        ],
      },
    ];

    const messages = formatValidationMessages(errors as unknown as readonly ValidationError[]);
    expect(messages).toEqual(['name must be a string', 'key must be a string']);
  });

  it('does not log when undeclared properties list is empty', () => {
    const logs: string[] = [];
    const mockLogger = { warn: (msg: string) => logs.push(msg) };
    logUndeclaredPropertiesObservation([], 'SampleDto', mockLogger);
    expect(logs).toEqual([]);
  });
});
