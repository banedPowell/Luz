import type { AppSettings } from '#shared/domain/settings'
import type { DestinationContext, DownloadJob, DownloadOptions } from '#shared/domain/download'
import { libraryService } from '../library/library.service'
import {
  resolveDestinationMode,
  resolveEffectiveOutputTemplate,
  resolvePlaylistFolderName,
  type ResolvedDestinationMode
} from '#shared/utils/download-destination'

export interface JobDestinationInfo {
  mode: ResolvedDestinationMode
  template: string
  playlistTitle: string
}

export function resolveJobDestination(
  job: Pick<DownloadJob, 'url' | 'destinationContext' | 'options' | 'outputTemplate' | 'sourceTitle' | 'tracks'>,
  settings: AppSettings
): JobDestinationInfo {
  const luzPlaylistName = job.destinationContext.playlistId
    ? libraryService.getPlaylist(job.destinationContext.playlistId).name
    : undefined

  const mode = resolveDestinationMode(
    job.options.destinationMode,
    job.destinationContext,
    job.tracks.length,
    job.url
  )

  const template = resolveEffectiveOutputTemplate(settings, mode, job.outputTemplate)
  const playlistTitle = resolvePlaylistFolderName({
    luzPlaylistName,
    sourceTitle: job.sourceTitle
  })

  return { mode, template, playlistTitle }
}

export function resolvePreviewDestination(input: {
  url: string
  destinationContext: DestinationContext
  options: DownloadOptions
  outputTemplate?: string
  sourceTitle?: string
  trackCount?: number
  luzPlaylistName?: string
}, settings: AppSettings): JobDestinationInfo {
  const mode = resolveDestinationMode(
    input.options.destinationMode,
    input.destinationContext,
    input.trackCount ?? 1,
    input.url
  )
  const template = resolveEffectiveOutputTemplate(settings, mode, input.outputTemplate)
  const playlistTitle = resolvePlaylistFolderName({
    luzPlaylistName: input.luzPlaylistName,
    sourceTitle: input.sourceTitle
  })
  return { mode, template, playlistTitle }
}
