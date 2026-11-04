import path from 'node:path';
import { trackAudioOf, type TrackAudio } from '@luz/core';

// The codecs music-metadata reports for the fixtures (see test/unit/tag-reader.test.ts)
const codecsByExtension: Record<string, string> = {
	'.flac': 'FLAC',
	'.wav': 'PCM',
	'.mp3': 'MPEG 1 Layer 3',
	'.ogg': 'Vorbis I',
	'.opus': 'Opus',
	'.m4a': 'MPEG-4/AAC',
};

/** What the tag reader would say of a file's audio, guessed from its extension. */
export function audioOf(filePath: string): TrackAudio {
	return trackAudioOf({ codec: codecsByExtension[path.extname(filePath).toLowerCase()] });
}
