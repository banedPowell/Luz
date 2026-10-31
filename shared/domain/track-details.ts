export interface DetailRow {
  label: string
  value: string
}

export interface TrackDetails {
  credits: DetailRow[]
  technical: DetailRow[]
  file: DetailRow[]
  source: DetailRow[]
  other: DetailRow[]
}
