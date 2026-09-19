import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ACTIVE_ELECTION_YEAR } from '@/lib/supabase'
import {
  buildDreamCabinetStats,
  type DreamCabinetStatsRpcRow,
} from '@/lib/fetchDreamCabinetStats'
import { getServiceEnv, jsonError, jsonOk } from '@/server/apiCommon'

function getAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getServiceEnv()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

export async function GET(request: NextRequest) {
  const admin = getAdminClient()
  if (!admin) {
    return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
  }

  const electionIdParam = request.nextUrl.searchParams.get('electionId')
  let electionId =
    electionIdParam !== null ? Number(electionIdParam) : null

  if (electionId !== null) {
    if (!Number.isInteger(electionId) || electionId < 1) {
      return jsonError('מזהה בחירות לא תקין', 400)
    }
  } else {
    const { data: election, error: electionError } = await admin
      .from('elections')
      .select('id')
      .eq('year', ACTIVE_ELECTION_YEAR)
      .maybeSingle()

    if (electionError) {
      return jsonError(electionError.message, 500)
    }
    if (!election?.id) {
      return jsonError('לא נמצאה בחירת 2026', 404)
    }
    electionId = election.id as number
  }

  const { data, error } = await admin.rpc('get_dream_cabinet_pick_stats', {
    p_election_id: electionId,
  })

  if (error) {
    return jsonError(error.message, 500)
  }

  const stats = buildDreamCabinetStats(
    (data ?? []) as DreamCabinetStatsRpcRow[],
  )

  return jsonOk({ ok: true, electionId, offices: stats.offices })
}
