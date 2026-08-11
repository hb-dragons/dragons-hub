import * as migration_20260802_122438_initial from './20260802_122438_initial';
import * as migration_20260803_135820_strapi_migration_schema from './20260803_135820_strapi_migration_schema';

export const migrations = [
  {
    up: migration_20260802_122438_initial.up,
    down: migration_20260802_122438_initial.down,
    name: '20260802_122438_initial',
  },
  {
    up: migration_20260803_135820_strapi_migration_schema.up,
    down: migration_20260803_135820_strapi_migration_schema.down,
    name: '20260803_135820_strapi_migration_schema'
  },
];
