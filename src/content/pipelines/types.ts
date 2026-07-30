export type PipelineTable = {
  headers: string[]
  rows: string[][]
}

export type PipelineSection = {
  id: string
  title: string
  paragraphs?: string[]
  list?: string[]
  code?: string
  table?: PipelineTable
}

export type PipelineSchedule = {
  /** Hebrew display line, e.g. כל יום בחצות · 00:00 שעון ישראל */
  label: string
  cron?: string
  timezone?: string
}

export type PipelineDoc = {
  id: string
  title: string
  subtitle: string
  status: 'live' | 'planned'
  sections: PipelineSection[]
  /** Docs path under /piplines/docs */
  docsPath: string
  /** Optional edit / runner UI */
  editPath?: string
  /** Automated schedule; null / placeholder when not timed yet */
  schedule: PipelineSchedule | null
}
