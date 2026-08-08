import { createObjectStorageAdapter } from './adapter.js';

describe('createObjectStorageAdapter', () => {
  it('creates an s3-profile adapter for an s3 config', () => {
    const adapter = createObjectStorageAdapter({
      profile: 's3',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      bucket: 'copalibre-objects',
    });
    expect(adapter.profile).toBe('s3');
  });

  it('creates a filesystem-profile adapter for a filesystem config', () => {
    const adapter = createObjectStorageAdapter({ profile: 'filesystem', rootDirectory: '/tmp' });
    expect(adapter.profile).toBe('filesystem');
  });
});
