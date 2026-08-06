import { objectStorageConfigFromEnv } from './object-storage.js';

const COMPLETE: NodeJS.ProcessEnv = {
  COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
  COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: 'access-key',
  COPALIBRE_OBJECT_STORAGE_SECRET_KEY: 'secret-key',
  COPALIBRE_OBJECT_STORAGE_BUCKET: 'copalibre-evidence',
};

describe('objectStorageConfigFromEnv', () => {
  it('resolves a config from all four required settings', () => {
    expect(objectStorageConfigFromEnv(COMPLETE)).toEqual({
      endpoint: 'http://localhost:9000',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      bucket: 'copalibre-evidence',
    });
  });

  it('includes an explicit region when set', () => {
    expect(
      objectStorageConfigFromEnv({ ...COMPLETE, COPALIBRE_OBJECT_STORAGE_REGION: 'eu-west-1' }),
    ).toMatchObject({ region: 'eu-west-1' });
  });

  it.each([
    'COPALIBRE_OBJECT_STORAGE_URL',
    'COPALIBRE_OBJECT_STORAGE_ACCESS_KEY',
    'COPALIBRE_OBJECT_STORAGE_SECRET_KEY',
    'COPALIBRE_OBJECT_STORAGE_BUCKET',
  ] as const)('is undefined when %s is missing', (key) => {
    const rest = { ...COMPLETE };
    delete rest[key];
    expect(objectStorageConfigFromEnv(rest)).toBeUndefined();
  });

  it('is undefined for a completely unconfigured environment', () => {
    expect(objectStorageConfigFromEnv({})).toBeUndefined();
  });
});
