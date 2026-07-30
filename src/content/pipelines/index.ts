import { knessetPipeline } from './knesset'
import { electionsCandidatesPipeline } from './electionsCandidates'
import { elections2026PollsPipeline } from './elections2026Polls'
import type { PipelineDoc } from './types'

export const PIPELINES: PipelineDoc[] = [
  knessetPipeline,
  electionsCandidatesPipeline,
  elections2026PollsPipeline,
]

export const DEFAULT_PIPELINE_ID = PIPELINES[0]?.id ?? 'knesset'

export function getPipelineById(id: string): PipelineDoc | undefined {
  return PIPELINES.find((pipeline) => pipeline.id === id)
}

export type { PipelineDoc, PipelineSection, PipelineTable, PipelineSchedule } from './types'
