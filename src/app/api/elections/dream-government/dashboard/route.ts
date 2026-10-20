import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildDreamCabinetDashboard,
  fetchAllDreamCabinetPickActivity,
  type DreamCabinetCandidateMetaRow,
} from '@/lib/fetchDreamCabinetDashboard'
import type { DreamCabinetStatsRpcRow } from '@/lib/fetchDreamCabinetStats'
import { ACTIVE_ELECTION_YEAR } from '@/lib/supabase'
import {
  getServiceEnv,
  jsonError,
  jsonOk,
  requirePipelineSecret,
} from '@/server/apiCommon'

function getAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getServiceEnv()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

export async function GET(request: NextRequest) {
  const auth = requirePipelineSecret(request)
  if (auth.error) return auth.error

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

  const [statsResult, activityResult] = await Promise.all([
    admin.rpc('get_dream_cabinet_pick_stats', {
      p_election_id: electionId,
    }),
    fetchAllDreamCabinetPickActivity(admin, electionId),
  ])

  if (statsResult.error) {
    return jsonError(statsResult.error.message, 500)
  }
  if (activityResult.error) {
    return jsonError(activityResult.error, 500)
  }

  const statsRows = (statsResult.data ?? []) as DreamCabinetStatsRpcRow[]
  const activityRows = activityResult.rows

  const candidateIds = [
    ...new Set(
      statsRows
        .map((row) => Number(row.candidate_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ]

  let candidates: DreamCabinetCandidateMetaRow[] = []
  if (candidateIds.length > 0) {
    const { data, error } = await admin
      .from('election_candidates')
      .select(
        `
        id,
        people:person_id ( full_name, image_url ),
        election_parties:party_id ( name, short_name, color )
      `,
      )
      .in('id', candidateIds)

    if (error) {
      return jsonError(error.message, 500)
    }
    candidates = (data ?? []) as DreamCabinetCandidateMetaRow[]
  }

  const dashboard = buildDreamCabinetDashboard({
    electionId,
    statsRows,
    activityRows,
    candidates,
  })

  return jsonOk({ ok: true, ...dashboard })
}
