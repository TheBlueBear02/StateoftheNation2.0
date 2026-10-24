'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchPartyLeaders } from '../lib/fetchElectionParties'
import {
  getChannelPoll,
  listBordersChannels,
  orderBordersParties,
  type BordersChannel,
  type BordersPartyColumn,
} from '../lib/governmentBorders'
import { supabase, supabaseConfigError } from '../lib/supabase'
import type { ElectionPartyLeader } from '../lib/supabase'
import { usePolls } from './usePolls'

export type UseGovernmentBordersDataResult = {
  loading: boolean
  error: string | null
  channels: BordersChannel[]
  columns: BordersPartyColumn[]
  leadersLoading: boolean
}

export function useGovernmentBordersData(
  channelKey: string | null,
): UseGovernmentBordersDataResult {
  const { polls, loading, error } = usePolls(120)
  const [leadersByPartyId, setLeadersByPartyId] = useState<
    Map<number, ElectionPartyLeader>
  >(() => new Map())
  const [leadersLoading, setLeadersLoading] = useState(false)

  const channels = useMemo(() => listBordersChannels(polls), [polls])

  const activeChannelKey = channelKey ?? channels[0]?.key ?? null

  const poll = useMemo(() => {
    if (!activeChannelKey) return null
    return getChannelPoll(polls, activeChannelKey)
  }, [polls, activeChannelKey])

  const partyIdsKey = useMemo(() => {
    if (!poll) return ''
    return poll.results
      .filter((r) => (r.seats ?? 0) > 0)
      .map((r) => r.partyId)
      .sort((a, b) => a - b)
      .join(',')
  }, [poll])

  useEffect(() => {
    if (!partyIdsKey) {
      setLeadersByPartyId(new Map())
      setLeadersLoading(false)
      return
    }

    if (supabaseConfigError || !supabase) {
      setLeadersByPartyId(new Map())
      setLeadersLoading(false)
      return
    }

    const partyIds = partyIdsKey.split(',').map(Number)
    let cancelled = false
    setLeadersLoading(true)

    void fetchPartyLeaders(supabase, partyIds).then((map) => {
      if (cancelled) return
      setLeadersByPartyId(map)
      setLeadersLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [partyIdsKey])

  const columns = useMemo(() => {
    if (!poll) return []
    return orderBordersParties(poll.results, leadersByPartyId)
  }, [poll, leadersByPartyId])

  return {
    loading,
    error,
    channels,
    columns,
    leadersLoading,
  }
}
