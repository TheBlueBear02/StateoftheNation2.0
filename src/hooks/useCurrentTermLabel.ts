'use client'

import { useEffect, useState } from 'react'
import { formatCurrentTermLabel } from '../lib/termLabel'
import { supabase } from '../lib/supabase'

/**
 * Live government + Knesset label from knessets.is_active and governments.is_active.
 * Loaded in the browser so a static prerender cannot freeze a term number into the HTML.
 */
export function useCurrentTermLabel(): string {
  const [label, setLabel] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase) {
        return
      }

      const [knessetResult, governmentResult] = await Promise.all([
        supabase
          .from('knessets')
          .select('knesset_number')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('governments')
          .select('government_number')
          .eq('is_active', true)
          .maybeSingle(),
      ])

      if (cancelled) {
        return
      }

      const knessetNumber =
        knessetResult.error || knessetResult.data?.knesset_number == null
          ? null
          : knessetResult.data.knesset_number
      const governmentNumber =
        governmentResult.error || governmentResult.data?.government_number == null
          ? null
          : governmentResult.data.government_number

      setLabel(formatCurrentTermLabel(governmentNumber, knessetNumber))
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return label
}
