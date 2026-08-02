import * as migration_20260802_122438_initial from './20260802_122438_initial';

export const migrations = [
  {
    up: migration_20260802_122438_initial.up,
    down: migration_20260802_122438_initial.down,
    name: '20260802_122438_initial'
  },
];
