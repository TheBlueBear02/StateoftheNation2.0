import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import {
  DREAM_ALL_OFFICES,
  type DreamOfficeId,
} from '@/lib/dreamGovernmentOffices'
import { ACTIVE_ELECTION_YEAR } from '@/lib/supabase'
import { getServiceEnv, jsonError, jsonOk } from '@/server/apiCommon'

const VALID_OFFICE_IDS = new Set<string>(
  DREAM_ALL_OFFICES.map((office) => office.id),
)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SubmitPick = {
  officeId?: string
  candidateId?: number
}

type SubmitBody = {
  clientId?: string
  electionId?: number
  picks?: SubmitPick[]
}

function getAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = getServiceEnv()
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

export async function POST(request: NextRequest) {
  const admin = getAdminClient()
  if (!admin) {
    return jsonError('חסר SUPABASE_SERVICE_KEY או SUPABASE_URL', 503)
  }

  let body: SubmitBody
  try {
    body = (await request.json()) as SubmitBody
  } catch {
    return jsonError('גוף בקשה לא תקין', 400)
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  if (!UUID_RE.test(clientId)) {
    return jsonError('מזהה לקוח לא תקין', 400)
  }

  const picks = Array.isArray(body.picks) ? body.picks : []
  if (picks.length === 0) {
    return jsonError('אין בחירות לשמירה', 400)
  }
  if (picks.length > VALID_OFFICE_IDS.size) {
    return jsonError('יותר מדי בחירות', 400)
  }

  const seenOffices = new Set<string>()
  const normalized: Array<{ officeId: DreamOfficeId; candidateId: number }> =
    []

  for (const pick of picks) {
    const officeId =
      typeof pick.officeId === 'string' ? pick.officeId.trim() : ''
    const candidateId = Number(pick.candidateId)

    if (!VALID_OFFICE_IDS.has(officeId)) {
      return jsonError('משרד לא תקין', 400)
    }
    if (seenOffices.has(officeId)) {
      return jsonError('משרד כפול בבקשה', 400)
    }
    if (!Number.isInteger(candidateId) || candidateId < 1) {
      return jsonError('מזהה מועמד לא תקין', 400)
    }

    seenOffices.add(officeId)
    normalized.push({
      officeId: officeId as DreamOfficeId,
      candidateId,
    })
  }

  let electionId =
    body.electionId !== undefined ? Number(body.electionId) : null

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

  const candidateIds = [
    ...new Set(normalized.map((pick) => pick.candidateId)),
  ]
  const { data: candidates, error: candidatesError } = await admin
    .from('election_candidates')
    .select('id, person_id, party_id, election_id')
    .in('id', candidateIds)

  if (candidatesError) {
    return jsonError(candidatesError.message, 500)
  }

  const candidateById = new Map(
    (candidates ?? []).map((row) => [row.id as number, row]),
  )

  if (candidateById.size !== candidateIds.length) {
    return jsonError('מועמד לא נמצא', 400)
  }

  for (const pick of normalized) {
    const row = candidateById.get(pick.candidateId)
    if (!row || row.election_id !== electionId) {
      return jsonError('מועמד לא שייך לבחירות אלה', 400)
    }
  }

  const rows = normalized.map((pick) => {
    const candidate = candidateById.get(pick.candidateId)!
    return {
      election_id: electionId,
      client_id: clientId,
      office_id: pick.officeId,
      candidate_id: pick.candidateId,
      person_id: candidate.person_id as number,
      party_id: candidate.party_id as number,
      updated_at: new Date().toISOString(),
    }
  })

  const { error: upsertError } = await admin.from('dream_cabinet_picks').upsert(
    rows,
    { onConflict: 'election_id,client_id,office_id' },
  )

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return jsonOk({ ok: true, saved: rows.length })
}
