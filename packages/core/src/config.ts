import { z } from 'zod';

const toolPathSchema = z.string().trim().min(1);

// Server configuration as read from the environment (ADR 0003). Validated at
// startup so a typo in a variable fails loudly instead of surfacing later.
export const serverConfigSchema = z.object({
	// Empty means "use the per-OS default", which only the server can resolve
	dataDir: z.string().trim(),
	ytDlpPath: toolPathSchema,
	ffmpegPath: toolPathSchema,
	ffprobePath: toolPathSchema,
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
