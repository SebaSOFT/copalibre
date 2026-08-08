import { objectStorageConfigFromEnv } from './config.js';

describe('objectStorageConfigFromEnv', () => {
  it('resolves the s3 profile when all four required settings are present', () => {
    expect(
      objectStorageConfigFromEnv({
        COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
        COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: 'access-key',
        COPALIBRE_OBJECT_STORAGE_SECRET_KEY: 'secret-key',
        COPALIBRE_OBJECT_STORAGE_BUCKET: 'copalibre-objects',
      }),
    ).toEqual({
      profile: 's3',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      bucket: 'copalibre-objects',
    });
  });

  it('includes an explicit region when set', () => {
    expect(
      objectStorageConfigFromEnv({
        COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
        COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: 'access-key',
        COPALIBRE_OBJECT_STORAGE_SECRET_KEY: 'secret-key',
        COPALIBRE_OBJECT_STORAGE_BUCKET: 'copalibre-objects',
        COPALIBRE_OBJECT_STORAGE_REGION: 'eu-west-1',
      }),
    ).toMatchObject({ region: 'eu-west-1' });
  });

  it.each([
    'COPALIBRE_OBJECT_STORAGE_ACCESS_KEY',
    'COPALIBRE_OBJECT_STORAGE_SECRET_KEY',
    'COPALIBRE_OBJECT_STORAGE_BUCKET',
  ] as const)(
    'falls back to filesystem when only %s is missing from an otherwise-set s3 config',
    (key) => {
      const env: NodeJS.ProcessEnv = {
        COPALIBRE_OBJECT_STORAGE_URL: 'http://localhost:9000',
        COPALIBRE_OBJECT_STORAGE_ACCESS_KEY: 'access-key',
        COPALIBRE_OBJECT_STORAGE_SECRET_KEY: 'secret-key',
        COPALIBRE_OBJECT_STORAGE_BUCKET: 'copalibre-objects',
      };
      delete env[key];
      expect(objectStorageConfigFromEnv(env)).toMatchObject({ profile: 'filesystem' });
    },
  );

  it('falls back to filesystem, rooted under COPALIBRE_DATA_DIR, when nothing is configured', () => {
    expect(objectStorageConfigFromEnv({ COPALIBRE_DATA_DIR: '/var/lib/copalibre' })).toEqual({
      profile: 'filesystem',
      rootDirectory: '/var/lib/copalibre/objects',
    });
  });

  it('defaults the data directory to ./data when unset', () => {
    expect(objectStorageConfigFromEnv({})).toEqual({
      profile: 'filesystem',
      rootDirectory: './data/objects',
    });
  });

  it('honours an explicit filesystem root override', () => {
    expect(
      objectStorageConfigFromEnv({
        COPALIBRE_OBJECT_STORAGE_FILESYSTEM_ROOT: '/mnt/objects',
      }),
    ).toEqual({ profile: 'filesystem', rootDirectory: '/mnt/objects' });
  });
});
