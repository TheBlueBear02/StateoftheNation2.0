'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function formatPipelineElapsed(seconds: number): string {
  if (seconds <= 0) {
    return 'מתחיל…'
  }
  if (seconds < 60) {
    return `${seconds} שנ'`
  }
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}:${String(rem).padStart(2, '0')}`
}

/** Live total + per-step elapsed while a multi-stage pipeline run is in progress. */
export function usePipelineRunProgress(running: boolean) {
  const [totalElapsedSeconds, setTotalElapsedSeconds] = useState(0)
  const [stepElapsedSeconds, setStepElapsedSeconds] = useState(0)
  const [currentStage, setCurrentStage] = useState<number | null>(null)
  const [stepDurations, setStepDurations] = useState<Record<number, number>>({})
  const stepStartedAtRef = useRef<number | null>(null)
  const currentStageRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) {
      return
    }

    const timer = window.setInterval(() => {
      setTotalElapsedSeconds((current) => current + 1)
      setStepElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [running])

  const resetRun = useCallback(() => {
    setTotalElapsedSeconds(0)
    setStepElapsedSeconds(0)
    setCurrentStage(null)
    currentStageRef.current = null
    setStepDurations({})
    stepStartedAtRef.current = null
  }, [])

  const beginStep = useCallback((stage: number) => {
    const previous = currentStageRef.current
    const previousStarted = stepStartedAtRef.current
    if (previous !== null && previousStarted !== null && previous !== stage) {
      const seconds = Math.max(1, Math.round((Date.now() - previousStarted) / 1000))
      setStepDurations((current) => ({ ...current, [previous]: seconds }))
    }

    currentStageRef.current = stage
    setCurrentStage(stage)
    setStepElapsedSeconds(0)
    stepStartedAtRef.current = Date.now()
  }, [])

  const finishStep = useCallback((stage: number) => {
    const started = stepStartedAtRef.current
    const seconds =
      started !== null
        ? Math.max(1, Math.round((Date.now() - started) / 1000))
        : 1
    setStepDurations((current) => ({ ...current, [stage]: seconds }))
    if (currentStageRef.current === stage) {
      currentStageRef.current = null
      setCurrentStage(null)
      stepStartedAtRef.current = null
    }
  }, [])

  const clearCurrent = useCallback(() => {
    currentStageRef.current = null
    setCurrentStage(null)
    stepStartedAtRef.current = null
  }, [])

  return {
    totalElapsedSeconds,
    stepElapsedSeconds,
    currentStage,
    stepDurations,
    resetRun,
    beginStep,
    finishStep,
    clearCurrent,
  }
}
