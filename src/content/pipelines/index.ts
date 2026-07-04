import { knessetPipeline } from './knesset'
import { electionsCandidatesPipeline } from './electionsCandidates'
import type { PipelineDoc } from './types'

export const PIPELINES: PipelineDoc[] = [knessetPipeline, electionsCandidatesPipeline]

export const DEFAULT_PIPELINE_ID = PIPELINES[0]?.id ?? 'knesset'

export function getPipelineById(id: string): PipelineDoc | undefined {
  return PIPELINES.find((pipeline) => pipeline.id === id)
}

export type { PipelineDoc, PipelineSection, PipelineTable } from './types'
