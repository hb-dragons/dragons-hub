import * as migration_20260802_122438_initial from './20260802_122438_initial';
import * as migration_20260803_135820_strapi_migration_schema from './20260803_135820_strapi_migration_schema';
import * as migration_20260830_133823_add_teams_order from './20260830_133823_add_teams_order';
import * as migration_20260830_133916_drop_teams_order_index from './20260830_133916_drop_teams_order_index';
import * as migration_20260904_102644_drop_trainers_and_league_fields from './20260904_102644_drop_trainers_and_league_fields';

export const migrations = [
  {
    up: migration_20260802_122438_initial.up,
    down: migration_20260802_122438_initial.down,
    name: '20260802_122438_initial',
  },
  {
    up: migration_20260803_135820_strapi_migration_schema.up,
    down: migration_20260803_135820_strapi_migration_schema.down,
    name: '20260803_135820_strapi_migration_schema',
  },
  {
    up: migration_20260830_133823_add_teams_order.up,
    down: migration_20260830_133823_add_teams_order.down,
    name: '20260830_133823_add_teams_order',
  },
  {
    up: migration_20260830_133916_drop_teams_order_index.up,
    down: migration_20260830_133916_drop_teams_order_index.down,
    name: '20260830_133916_drop_teams_order_index'
  },
  {
    up: migration_20260904_102644_drop_trainers_and_league_fields.up,
    down: migration_20260904_102644_drop_trainers_and_league_fields.down,
    name: '20260904_102644_drop_trainers_and_league_fields'
  },
];
