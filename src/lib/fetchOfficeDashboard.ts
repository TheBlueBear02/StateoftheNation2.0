import { resolveFactionColor } from './hemicycle'
import {
  supabase,
  supabaseConfigError,
  type GovernmentAppointmentRow,
  type GovernmentMembershipFactionRow,
  type IndexChartType,
  type IndexDataRow,
  type IndexRow,
  type KnessetFaction,
  type KnessetPerson,
  type OfficeDashboardOfficeRow,
} from './supabase'
import { OFFICE_INDEX_ICON_BY_NAME } from './officeIndexIconMap'

/** PostgREST default page size; office dashboard series exceed one page. */
const INDEX_DATA_PAGE_SIZE = 1000

/**
 * Fetch all index_data rows for the given index ids, paging past the ~1000-row
 * PostgREST cap. Without this, the newest points (e.g. בן גביר years) are dropped
 * because the query is ordered by recorded_at ascending.
 */
async function fetchAllIndexData(
  indexIds: number[],
): Promise<{ rows: IndexDataRow[]; error: string | null }> {
  if (!supabase || indexIds.length === 0) {
    return { rows: [], error: null }
  }

  const rows: IndexDataRow[] = []
  let from = 0
  for (;;) {
    const to = from + INDEX_DATA_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('index_data')
      .select('id, index_id, label, value, recorded_at')
      .in('index_id', indexIds)
      .order('recorded_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      return { rows: [], error: error.message }
    }

    const chunk = (data ?? []) as IndexDataRow[]
    rows.push(...chunk)
    if (chunk.length < INDEX_DATA_PAGE_SIZE) break
    from += INDEX_DATA_PAGE_SIZE
  }

  return { rows, error: null }
}

/** Curated quadrant order — National Security first on open / picker. */
export const OFFICE_DASHBOARD_DISPLAY_ORDER: string[] = [
  'ביטחון לאומי',
  'תחבורה',
  'אוצר',
  'חינוך',
]

/**
 * Extra name fragments that map onto a dashboard portfolio. National Security
 * is the renamed Ministry of Public Security (ביטחון הפנים) and also succeeded
 * the older Police Ministry (משטרה) — historical appointments live under those
 * names and should appear as one continuous minister timeline.
 */
const PORTFOLIO_NAME_ALIASES: Record<string, string[]> = {
  'ביטחון לאומי': [
    'ביטחון לאומי',
    'ביטחון הפנים',
    'ביטחון פנים',
    'בטחון הפנים',
    'בטחון פנים',
    'משטרה',
  ],
}

export type OfficeDashboardMinister = {
  personId: number
  fullName: string
  imageUrl: string | null
  dutyDesc: string | null
  /** Current Knesset party / faction short label when known. */
  partyName: string | null
}

export type OfficeDashboardMinisterEra = {
  personId: number
  fullName: string
  imageUrl: string | null
  factionName: string | null
  factionColor: string | null
  startDate: string
  endDate: string
}

export type OfficeDashboardPoint = {
  label: string
  value: number
  recordedAt: string
}

export type OfficeDashboardIndex = {
  id: number
  name: string
  info: string | null
  icon: string
  isKpi: boolean
  alert: boolean
  /** Rise vs compared era is an improvement when true (colors the delta badge). */
  higherIsBetter: boolean
  chartType: IndexChartType
  source: string | null
  points: OfficeDashboardPoint[]
  latestValue: number | null
  previousValue: number | null
  percentChange: number | null
  latestLabel: string | null
}

export type OfficeDashboardOffice = {
  id: number
  name: string
  info: string | null
  logoUrl: string | null
  minister: OfficeDashboardMinister | null
  ministerHistory: OfficeDashboardMinisterEra[]
  indexes: OfficeDashboardIndex[]
  kpis: OfficeDashboardIndex[]
  policies: OfficeDashboardIndex[]
}

export type OfficeDashboardResult = {
  offices: OfficeDashboardOffice[]
  error: string | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeChartType(raw: string | null | undefined): IndexChartType {
  if (raw === 'bar' || raw === 'pie' || raw === 'line') return raw
  return 'line'
}

/** Public URL for an index icon; falls back to white bag placeholder. */
export function resolveIndexIconUrl(
  icon: string | null | undefined,
  opts?: { isKpi?: boolean; alert?: boolean; name?: string },
): string {
  const fallback = '/images/offices/white_bag.png'

  const fromName = opts?.name
    ? OFFICE_INDEX_ICON_BY_NAME[opts.name]
    : undefined
  const raw = icon?.trim() || fromName
  if (!raw) return fallback

  let path = raw.replace(/\\/g, '/')
  if (path.startsWith('static/images/')) {
    path = `/${path.slice('static/'.length)}`
  } else if (path.startsWith('/static/images/')) {
    path = path.replace('/static/', '/')
  } else if (path.startsWith('images/')) {
    path = `/${path}`
  } else if (!path.startsWith('/')) {
    path = `/${path}`
  }
  return path
}

function officeDisplayName(row: OfficeDashboardOfficeRow): string {
  const name = row.name?.trim() || ''
  const category = row.knesset_category_name?.trim() || ''
  // Prefer the full office title (e.g. משרד האוצר) over short Knesset
  // category labels (e.g. האוצר).
  if (name) return name
  if (category) return category
  return 'משרד ללא שם'
}

function displayOrderRank(name: string): number {
  const idx = OFFICE_DASHBOARD_DISPLAY_ORDER.findIndex((needle) =>
    name.includes(needle),
  )
  return idx === -1 ? 99 : idx
}

function buildIndex(
  row: IndexRow,
  dataByIndex: Map<number, IndexDataRow[]>,
): OfficeDashboardIndex {
  const rawPoints = (dataByIndex.get(row.id) ?? [])
    .slice()
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))

  const points: OfficeDashboardPoint[] = rawPoints.map((point) => ({
    label: point.label,
    value: toNumber(point.value),
    recordedAt: point.recorded_at,
  }))

  const latest = points.length > 0 ? points[points.length - 1] : null
  const previous = points.length > 1 ? points[points.length - 2] : null
  let percentChange: number | null = null
  if (latest && previous && previous.value !== 0) {
    percentChange = ((latest.value - previous.value) / Math.abs(previous.value)) * 100
  }

  return {
    id: row.id,
    name: row.name,
    info: row.info,
    icon: resolveIndexIconUrl(row.icon, {
      isKpi: Boolean(row.is_kpi),
      alert: Boolean(row.alert),
      name: row.name,
    }),
    isKpi: Boolean(row.is_kpi),
    alert: Boolean(row.alert),
    // Missing/legacy rows default to higher-is-better.
    higherIsBetter:
      row.higher_is_better === null || row.higher_is_better === undefined
        ? true
        : Boolean(row.higher_is_better),
    chartType: normalizeChartType(row.chart_type),
    source: row.source,
    points,
    latestValue: latest?.value ?? null,
    previousValue: previous?.value ?? null,
    percentChange,
    latestLabel: latest?.label ?? null,
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function normalizeDate(value: string | null | undefined): string | null {
  return value?.slice(0, 10) ?? null
}

function isActiveAt(row: GovernmentAppointmentRow, refDate: string): boolean {
  const start = normalizeDate(row.start_date)
  const end = normalizeDate(row.end_date)
  if (start && start > refDate) return false
  return !end || end >= refDate
}

function appointmentOfficeName(row: GovernmentAppointmentRow): string {
  const office = unwrapRelation(row.office)
  return (
    office?.knesset_category_name?.trim() ||
    office?.name?.trim() ||
    ''
  )
}

/** Knesset OData keeps many historical office rows with the same name; match by portfolio needle. */
function appointmentMatchesOffice(
  row: GovernmentAppointmentRow,
  officeId: number,
  officeName: string,
): boolean {
  if (row.office_id === officeId) return true

  const apptName = appointmentOfficeName(row)
  if (!apptName) return false

  for (const needle of OFFICE_DASHBOARD_DISPLAY_ORDER) {
    if (!officeName.includes(needle)) continue
    const terms = portfolioMatchTerms(needle)
    if (terms.some((term) => apptName.includes(term))) {
      return true
    }
  }
  return false
}

function ministerRank(row: GovernmentAppointmentRow): number {
  const duty = (row.duty_desc ?? '').trim()
  if (duty.startsWith('סגן') || duty.startsWith('סגנית')) return 40
  if (duty.includes('ממלא מקום') || duty.includes('מ"מ') || row.is_acting) return 30
  if (duty.startsWith('שר נוסף') || duty.startsWith('שרה נוספת')) return 20
  return 0
}

function pickMinisterForOffice(
  rows: GovernmentAppointmentRow[],
  officeId: number,
  officeName: string,
  refDate: string,
  memberships: MembershipForEra[],
): OfficeDashboardMinister | null {
  const candidates = rows
    .filter(
      (row) =>
        isActiveAt(row, refDate) &&
        appointmentMatchesOffice(row, officeId, officeName),
    )
    .sort((a, b) => {
      const rankDiff = ministerRank(a) - ministerRank(b)
      if (rankDiff !== 0) return rankDiff
      return (b.start_date ?? '').localeCompare(a.start_date ?? '')
    })

  const row = candidates[0]
  if (!row) return null

  const person = unwrapRelation<KnessetPerson>(row.person)
  const { factionName } = resolveFactionAtDate(
    memberships,
    row.person_id,
    refDate,
  )
  return {
    personId: row.person_id,
    fullName: person?.full_name ?? 'שר/ה',
    imageUrl: person?.image_url ?? null,
    dutyDesc: row.duty_desc,
    partyName: factionName,
  }
}

function portfolioNeedle(officeName: string): string | null {
  return (
    OFFICE_DASHBOARD_DISPLAY_ORDER.find((needle) => officeName.includes(needle)) ??
    null
  )
}

function portfolioMatchTerms(needle: string): string[] {
  return PORTFOLIO_NAME_ALIASES[needle] ?? [needle]
}

function officeMatchesNeedle(
  row: { name: string | null; knesset_category_name: string | null },
  needle: string,
): boolean {
  const name = row.name?.trim() || ''
  const category = row.knesset_category_name?.trim() || ''
  return portfolioMatchTerms(needle).some(
    (term) => name.includes(term) || category.includes(term),
  )
}

type MembershipForEra = {
  personId: number
  startDate: string | null
  endDate: string | null
  factionName: string | null
  factionColor: string | null
}

/**
 * Prefer DB short_name; otherwise compress Knesset list names like
 * `הליכוד - …` / `הליכוד בהנהגת …` down to the base party label.
 */
function shortFactionLabel(
  shortName: string | null | undefined,
  fullName: string | null | undefined,
): string | null {
  const short = shortName?.trim()
  if (short) return compressFactionLabel(short)

  const full = fullName?.trim()
  if (!full) return null
  return compressFactionLabel(full)
}

/** Known base party labels, longest first (for prefix matching). */
const KNOWN_PARTY_LABELS = [
  'המחנה הממלכתי',
  'הציונות הדתית',
  'האיחוד הלאומי',
  'הימין הממלכתי',
  'עוצמה יהודית',
  'ישראל ביתנו',
  'יהדות התורה',
  'כחול לבן',
  'יש עתיד',
  'הבית היהודי',
  'חדש-תעל',
  'העבודה',
  'הליכוד',
  'ימינה',
  'עבודה',
  'מרצ',
  'כולנו',
  'בלד',
  'נעם',
  'רעמ',
  'שס',
].sort((a, b) => b.length - a.length)

function compressFactionLabel(raw: string): string {
  const text = raw.replace(/["'״׳]/g, '').trim()
  if (!text) return raw.trim()

  // `הליכוד - תנועה לאומית…` / en/em dashes
  const dashHead = text.split(/\s+[–—-]\s+/)[0]?.trim()
  if (dashHead && dashHead !== text) {
    return matchKnownPartyLabel(dashHead) ?? dashHead
  }

  // `הליכוד בהנהגת בנימין נתניהו…` (no dash)
  const withoutLeader = text.replace(/\s+בהנהגת\b.*$/u, '').trim()
  if (withoutLeader && withoutLeader !== text) {
    return matchKnownPartyLabel(withoutLeader) ?? withoutLeader
  }

  return matchKnownPartyLabel(text) ?? text
}

function matchKnownPartyLabel(text: string): string | null {
  const normalized = text.replace(/["'״׳]/g, '').trim()
  for (const label of KNOWN_PARTY_LABELS) {
    if (
      normalized === label ||
      normalized.startsWith(`${label} `) ||
      normalized.startsWith(`${label}-`) ||
      normalized.startsWith(`${label}–`) ||
      normalized.startsWith(`${label}—`)
    ) {
      return label
    }
  }
  return null
}

/** Strip quotes so "הליכוד" / ״הליכוד״ map to the same key. */
function normalizePartyKey(name: string | null | undefined): string {
  const compressed = compressFactionLabel(name ?? '')
  return compressed.replace(/["'״׳]/g, '').trim()
}

/**
 * Stable party colors for the eras bar (ported from the old site's party_colors.js).
 * Same party name → same color across different ministers / Knesset faction rows.
 */
const OFFICE_DASHBOARD_PARTY_COLORS: Record<string, string> = {
  הליכוד: '#4169e1',
  'יש עתיד': '#ffb326',
  'המחנה הממלכתי': '#80caff',
  'כחול לבן': '#80caff',
  עבודה: '#6a0dad',
  העבודה: '#6a0dad',
  מרצ: '#1c7f08',
  'עוצמה יהודית': '#ff702e',
  'הציונות הדתית': '#8dc035',
  'האיחוד הלאומי': '#8dc035',
  ימינה: '#8dc035',
  'הבית היהודי': '#8dc035',
  'הימין הממלכתי': '#00008b',
  שס: '#363636',
  'יהדות התורה': '#1a4082',
  רעמ: '#008000',
  'חדש-תעל': '#db2121',
  'ישראל ביתנו': '#251aa1',
  נעם: '#add8e6',
  כולנו: '#488ba1',
  בלד: '#b33900',
}

function partyColorForEra(
  factionName: string | null,
  dbColor: string | null | undefined,
): string {
  const key = normalizePartyKey(factionName)
  if (key && OFFICE_DASHBOARD_PARTY_COLORS[key]) {
    return OFFICE_DASHBOARD_PARTY_COLORS[key]!
  }
  const trimmed = dbColor?.trim()
  if (trimmed) return trimmed
  if (key) return resolveFactionColor(null, null, key)
  return '#9a9a9a'
}

/**
 * Within one eras strip, force identical party labels to share one color
 * (Knesset OData often stores the same party under different faction_ids/colors).
 */
function unifyEraFactionColors(
  eras: OfficeDashboardMinisterEra[],
): OfficeDashboardMinisterEra[] {
  const colorByParty = new Map<string, string>()

  for (const era of eras) {
    const key = normalizePartyKey(era.factionName)
    if (!key) continue
    const color = era.factionColor?.trim()
    if (color && !colorByParty.has(key)) {
      colorByParty.set(key, color)
    }
  }

  for (const era of eras) {
    const key = normalizePartyKey(era.factionName)
    if (!key || colorByParty.has(key)) continue
    colorByParty.set(key, partyColorForEra(era.factionName, null))
  }

  return eras.map((era) => {
    const compressedName = era.factionName
      ? compressFactionLabel(era.factionName)
      : null
    const key = normalizePartyKey(compressedName)
    if (!key) {
      return compressedName === era.factionName
        ? era
        : { ...era, factionName: compressedName }
    }
    const color = colorByParty.get(key) ?? partyColorForEra(compressedName, era.factionColor)
    if (color === era.factionColor && compressedName === era.factionName) {
      return era
    }
    return {
      ...era,
      factionName: compressedName,
      factionColor: color,
    }
  })
}

function resolveFactionAtDate(
  memberships: MembershipForEra[],
  personId: number,
  atDate: string,
): { factionName: string | null; factionColor: string | null } {
  const forPerson = memberships
    .filter((m) => m.personId === personId)
    .filter((m) => Boolean(m.factionName?.trim()))
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))

  const containing = forPerson.find((m) => {
    const start = m.startDate
    const end = m.endDate
    if (start && start > atDate) return false
    return !end || end >= atDate
  })
  if (containing) {
    return {
      factionName: containing.factionName,
      factionColor: containing.factionColor,
    }
  }

  // Some Knesset rows leave faction_id null on the current term; use the
  // latest membership that still has a party label (e.g. רגב 2022–today).
  const latestBefore = forPerson.find(
    (m) => !m.startDate || m.startDate <= atDate,
  )
  if (latestBefore) {
    return {
      factionName: latestBefore.factionName,
      factionColor: latestBefore.factionColor,
    }
  }

  // Last resort: any known party for this person (even if membership dates
  // don't cover the appointment — better than a grey unlabeled era).
  const anyFaction = forPerson[0]
  return {
    factionName: anyFaction?.factionName ?? null,
    factionColor: anyFaction?.factionColor ?? null,
  }
}

/** Build chronological minister eras for one portfolio (primary ministers only). */
function buildMinisterEras(
  rows: GovernmentAppointmentRow[],
  memberships: MembershipForEra[],
  today: string,
): OfficeDashboardMinisterEra[] {
  const primary = rows
    .filter((row) => ministerRank(row) === 0)
    .filter((row) => normalizeDate(row.start_date))
    .sort((a, b) =>
      (normalizeDate(a.start_date) ?? '').localeCompare(
        normalizeDate(b.start_date) ?? '',
      ),
    )

  type Draft = {
    personId: number
    fullName: string
    imageUrl: string | null
    startDate: string
    endDate: string | null
  }

  const drafts: Draft[] = []
  for (const row of primary) {
    const startDate = normalizeDate(row.start_date)!
    const endDate = normalizeDate(row.end_date)
    const person = unwrapRelation<KnessetPerson>(row.person)
    const last = drafts[drafts.length - 1]
    if (last && last.personId === row.person_id) {
      // Merge consecutive terms for the same person; null end = still open.
      if (!last.endDate) {
        // keep open
      } else if (!endDate || endDate > last.endDate) {
        last.endDate = endDate
      }
      if (!last.imageUrl && person?.image_url) {
        last.imageUrl = person.image_url
      }
      continue
    }
    drafts.push({
      personId: row.person_id,
      fullName: person?.full_name ?? 'שר/ה',
      imageUrl: person?.image_url ?? null,
      startDate,
      endDate,
    })
  }

  return unifyEraFactionColors(
    drafts.map((draft, i) => {
      const next = drafts[i + 1]
      const endDate =
        next?.startDate ?? draft.endDate ?? today
      const faction = resolveFactionAtDate(
        memberships,
        draft.personId,
        draft.startDate,
      )
      return {
        personId: draft.personId,
        fullName: draft.fullName,
        imageUrl: draft.imageUrl,
        factionName: faction.factionName,
        factionColor: partyColorForEra(
          faction.factionName,
          faction.factionColor,
        ),
        startDate: draft.startDate,
        endDate,
      }
    }),
  )
}

export async function fetchOfficeDashboard(): Promise<OfficeDashboardResult> {
  if (supabaseConfigError || !supabase) {
    return {
      offices: [],
      error: supabaseConfigError ?? 'Supabase client is not configured',
    }
  }

  const { data: officeRows, error: officeError } = await supabase
    .from('offices')
    .select('id, name, knesset_category_name, info, logo_url, is_shown')
    .eq('is_shown', true)

  if (officeError) {
    return { offices: [], error: officeError.message }
  }

  const offices = (officeRows ?? []) as OfficeDashboardOfficeRow[]
  if (offices.length === 0) {
    return { offices: [], error: null }
  }

  const officeIds = offices.map((o) => o.id)

  const { data: indexRows, error: indexError } = await supabase
    .from('indexes')
    .select(
      'id, office_id, name, info, icon, is_kpi, alert, higher_is_better, chart_type, source, is_shown',
    )
    .in('office_id', officeIds)
    .eq('is_shown', true)
    .order('is_kpi', { ascending: false })
    .order('id')

  if (indexError) {
    return { offices: [], error: indexError.message }
  }

  const indexes = (indexRows ?? []) as IndexRow[]
  const indexIds = indexes.map((i) => i.id)

  let dataRows: IndexDataRow[] = []
  if (indexIds.length > 0) {
    const { rows: points, error: dataError } = await fetchAllIndexData(indexIds)
    if (dataError) {
      return { offices: [], error: dataError }
    }
    dataRows = points
  }

  const dataByIndex = new Map<number, IndexDataRow[]>()
  for (const point of dataRows) {
    const list = dataByIndex.get(point.index_id) ?? []
    list.push(point)
    dataByIndex.set(point.index_id, list)
  }

  const indexesByOffice = new Map<number, OfficeDashboardIndex[]>()
  for (const row of indexes) {
    const built = buildIndex(row, dataByIndex)
    const list = indexesByOffice.get(row.office_id) ?? []
    list.push(built)
    indexesByOffice.set(row.office_id, list)
  }

  // Current ministers for shown offices (active government)
  const { data: govRows } = await supabase
    .from('governments')
    .select('id, end_date, is_active')
    .eq('is_active', true)
    .limit(1)

  const activeGov = govRows?.[0] as
    | { id: number; end_date: string | null; is_active: boolean }
    | undefined

  let appointmentRows: GovernmentAppointmentRow[] = []
  let refDate = toDateString(new Date())

  if (activeGov) {
    refDate = normalizeDate(activeGov.end_date) ?? refDate
    // Load all appointments for the government. Dashboard offices and current
    // minister appointments often use different historical office_id duplicates
    // that share the same Hebrew name — matching falls back by portfolio name.
    const { data: appts } = await supabase
      .from('minister_appointments')
      .select(
        'id, person_id, government_id, office_id, start_date, end_date, duty_desc, is_acting, person:people(full_name, image_url), office:offices(name, knesset_category_name)',
      )
      .eq('government_id', activeGov.id)

    appointmentRows = (appts ?? []) as unknown as GovernmentAppointmentRow[]
  }

  // Historical minister eras: collect every duplicate office id per portfolio needle,
  // then load appointments across all governments for those ids.
  const { data: allOfficeRows } = await supabase
    .from('offices')
    .select('id, name, knesset_category_name')

  const portfolioOfficeIds = new Map<string, number[]>()
  for (const needle of OFFICE_DASHBOARD_DISPLAY_ORDER) {
    const ids = ((allOfficeRows ?? []) as Array<{
      id: number
      name: string | null
      knesset_category_name: string | null
    }>)
      .filter((row) => officeMatchesNeedle(row, needle))
      .map((row) => row.id)
    portfolioOfficeIds.set(needle, ids)
  }

  const historyOfficeIds = [
    ...new Set([...portfolioOfficeIds.values()].flat()),
  ]

  let historyAppts: GovernmentAppointmentRow[] = []
  if (historyOfficeIds.length > 0) {
    const { data: historyData } = await supabase
      .from('minister_appointments')
      .select(
        'id, person_id, government_id, office_id, start_date, end_date, duty_desc, is_acting, person:people(full_name, image_url), office:offices(name, knesset_category_name)',
      )
      .in('office_id', historyOfficeIds)
      .order('start_date', { ascending: true })

    historyAppts = (historyData ?? []) as unknown as GovernmentAppointmentRow[]
  }

  const historyPersonIds = [
    ...new Set(
      [
        ...historyAppts.map((row) => row.person_id),
        ...appointmentRows.map((row) => row.person_id),
      ].filter(Boolean),
    ),
  ]

  let memberships: MembershipForEra[] = []
  if (historyPersonIds.length > 0) {
    const { data: factionData } = await supabase
      .from('knesset_memberships')
      .select(
        'person_id, faction_id, start_date, end_date, faction:knesset_factions(name, short_name, color)',
      )
      .in('person_id', historyPersonIds)
      .order('start_date', { ascending: false })

    memberships = (
      (factionData ?? []) as unknown as GovernmentMembershipFactionRow[]
    ).map((row) => {
      const faction = unwrapRelation<KnessetFaction>(row.faction)
      const factionName = shortFactionLabel(faction?.short_name, faction?.name)
      return {
        personId: row.person_id,
        startDate: normalizeDate(row.start_date),
        endDate: normalizeDate(row.end_date),
        factionName,
        factionColor: resolveFactionColor(
          row.faction_id,
          faction?.color,
          factionName,
        ),
      }
    })
  }

  const today = toDateString(new Date())
  const erasByNeedle = new Map<string, OfficeDashboardMinisterEra[]>()
  for (const needle of OFFICE_DASHBOARD_DISPLAY_ORDER) {
    const ids = new Set(portfolioOfficeIds.get(needle) ?? [])
    const rows = historyAppts.filter(
      (row) => row.office_id !== null && ids.has(row.office_id),
    )
    erasByNeedle.set(needle, buildMinisterEras(rows, memberships, today))
  }

  const result: OfficeDashboardOffice[] = offices
    .map((row) => {
      const name = officeDisplayName(row)
      const officeIndexes = indexesByOffice.get(row.id) ?? []
      const needle = portfolioNeedle(name)
      return {
        id: row.id,
        name,
        info: row.info,
        logoUrl: row.logo_url,
        minister: pickMinisterForOffice(
          appointmentRows,
          row.id,
          name,
          refDate,
          memberships,
        ),
        ministerHistory: needle ? (erasByNeedle.get(needle) ?? []) : [],
        indexes: officeIndexes,
        kpis: officeIndexes.filter((i) => i.isKpi),
        policies: officeIndexes.filter((i) => !i.isKpi),
      }
    })
    .sort(
      (a, b) => displayOrderRank(a.name) - displayOrderRank(b.name) || a.id - b.id,
    )

  return { offices: result, error: null }
}

export function formatIndexValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return value.toLocaleString('he-IL', { maximumFractionDigits: 1 })
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatPercentChange(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return ''
  }
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : ''
  return `${arrow}${Math.abs(value).toFixed(1)}%`
}
