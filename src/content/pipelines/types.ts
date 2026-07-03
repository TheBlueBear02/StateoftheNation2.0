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

export type PipelineDoc = {
  id: string
  title: string
  subtitle: string
  status: 'live' | 'planned'
  sections: PipelineSection[]
}
