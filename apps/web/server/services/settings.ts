import type { Settings, SettingsPatch } from '@luz/core';

import type { Database } from '../infrastructure/database/client';
import { readSettings, writeSettings } from '../infrastructure/database/settings-repository';

// The database is passed in rather than fetched, so tests can run on a temporary one

export function getSettings(db: Database): Promise<Settings> {
	return readSettings(db);
}

export function updateSettings(db: Database, patch: SettingsPatch): Promise<Settings> {
	return writeSettings(db, patch);
}
