import { z } from 'zod';

export const themes = ['system', 'light', 'dark'] as const;

export const themeSchema = z.enum(themes);

export type Theme = z.infer<typeof themeSchema>;

export const settingsSchema = z.object({
	theme: themeSchema.default('system'),
	// Absent until the user picks a folder: there is no sensible default library location
	musicLibraryPath: z.string().trim().min(1).optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = settingsSchema.parse({});
