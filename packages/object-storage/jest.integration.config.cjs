const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

// Integration suite: real MinIO via COPALIBRE_OBJECT_STORAGE_* (docker-compose.dev.yml
// locally, a service container in CI) for the s3 profile, and a real temp
// directory on disk for the filesystem profile.
module.exports = {
  ...base,
  displayName: 'object-storage-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
