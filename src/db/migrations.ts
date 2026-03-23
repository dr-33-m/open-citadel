import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './client';
import migrations from '../../drizzle/migrations';

export async function runMigrations() {
  await migrate(db, migrations);
}
