import { z } from 'zod';

export const themes = ['system', 'light', 'dark'] as const;

export const themeSchema = z.enum(themes);

export type Theme = z.infer<typeof themeSchema>;

// POSIX root, Windows drive (C:\ or C:/) or UNC share, without node:path, which core cannot use
const absolutePath = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;

// Absolute only: a relative path would depend on the directory the server starts from
const musicLibraryPathSchema = z
	.string()
	.trim()
	.min(1)
	.regex(absolutePath, 'Use an absolute path, such as /home/me/Music or D:\\Music');

export const settingsSchema = z.object({
	theme: themeSchema.default('system'),
	// Absent until the user picks a folder: there is no sensible default library location
	musicLibraryPath: musicLibraryPathSchema.optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = settingsSchema.parse({});

/**
 * A partial update of the settings. Omitted keys stay as they are, so no default is
 * applied here; `null` clears the library path, which has no other way to be removed.
 * Unknown keys are rejected rather than silently dropped.
 */
export const settingsPatchSchema = z.strictObject({
	theme: themeSchema.optional(),
	musicLibraryPath: musicLibraryPathSchema.nullable().optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
