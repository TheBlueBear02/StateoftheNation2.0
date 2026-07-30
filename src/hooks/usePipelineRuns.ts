import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigError } from '../lib/supabase'

export type PipelineRunStatus = 'success' | 'error' | 'warning'

export type PipelineRunRow = {
  id: number
  pipeline: string
  action: string
  status: PipelineRunStatus
  started_at: string
  finished_at: string
  message: string | null
  error: string | null
  summary: Record<string, unknown> | null
  source: 'ui' | 'cli' | 'github-actions'
}

const LIMIT = 50

export function usePipelineRuns() {
  const [runs, setRuns] = useState<PipelineRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!supabase) {
      setError(supabaseConfigError)
      setRuns([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('pipeline_runs')
      .select(
        'id, pipeline, action, status, started_at, finished_at, message, error, summary, source',
      )
      .order('finished_at', { ascending: false })
      .limit(LIMIT)

    if (queryError) {
      setError(queryError.message)
      setRuns([])
      setLoading(false)
      return
    }

    setRuns((data ?? []) as PipelineRunRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { runs, loading, error, refetch }
}
