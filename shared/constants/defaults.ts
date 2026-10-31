export const DEFAULT_PROFILE_ID = 'default'

export const SUPPORTED_FORMATS = ['mp3', 'flac', 'm4a', 'opus', 'ogg', 'wav', 'ape', 'dsd'] as const
export const SUPPORTED_CODECS = ['mp3', 'flac', 'aac', 'opus', 'vorbis', 'pcm', 'ape', 'dsd'] as const

export const CACHE_POLICIES = ['reuse', 'duplicate', 'ask'] as const
export type CachePolicy = typeof CACHE_POLICIES[number]
