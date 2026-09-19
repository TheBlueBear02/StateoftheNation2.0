import {
  supabase,
  supabaseConfigError,
  type GovernmentAppointmentRow,
  type IndexChartType,
  type IndexDataRow,
  type IndexRow,
  type KnessetPerson,
  type OfficeDashboardOfficeRow,
} from './supabase'

/** Curated quadrant order (matches old site desired_order [3,2,5,4]). */
export const OFFICE_DASHBOARD_DISPLAY_ORDER: string[] = [
  'תחבורה',
  'ביטחון לאומי',
  'אוצר',
  'חינוך',
]

export type OfficeDashboardMinister = {
  personId: number
  fullName: string
  imageUrl: string | null
  dutyDesc: string | null
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
  icon: string | null
  isKpi: boolean
  alert: boolean
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

function officeDisplayName(row: OfficeDashboardOfficeRow): string {
  return (
    row.knesset_category_name?.trim() ||
    row.name?.trim() ||
    'משרד ללא שם'
  )
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
    icon: row.icon,
    isKpi: Boolean(row.is_kpi),
    alert: Boolean(row.alert),
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

function pickMinisterForOffice(
  rows: GovernmentAppointmentRow[],
  officeId: number,
  refDate: string,
): OfficeDashboardMinister | null {
  const candidates = rows
    .filter((row) => row.office_id === officeId && isActiveAt(row, refDate))
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))

  const row = candidates[0]
  if (!row) return null

  const person = unwrapRelation<KnessetPerson>(row.person)
  return {
    personId: row.person_id,
    fullName: person?.full_name ?? 'שר/ה',
    imageUrl: person?.image_url ?? null,
    dutyDesc: row.duty_desc,
  }
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
      'id, office_id, name, info, icon, is_kpi, alert, chart_type, source, is_shown',
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
    const { data: points, error: dataError } = await supabase
      .from('index_data')
      .select('id, index_id, label, value, recorded_at')
      .in('index_id', indexIds)
      .order('recorded_at', { ascending: true })

    if (dataError) {
      return { offices: [], error: dataError.message }
    }
    dataRows = (points ?? []) as IndexDataRow[]
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
    const { data: appts } = await supabase
      .from('minister_appointments')
      .select(
        'id, person_id, government_id, office_id, start_date, end_date, duty_desc, is_acting, person:people(full_name, image_url)',
      )
      .eq('government_id', activeGov.id)
      .in('office_id', officeIds)

    appointmentRows = (appts ?? []) as unknown as GovernmentAppointmentRow[]
  }

  const result: OfficeDashboardOffice[] = offices
    .map((row) => {
      const name = officeDisplayName(row)
      const officeIndexes = indexesByOffice.get(row.id) ?? []
      return {
        id: row.id,
        name,
        info: row.info,
        logoUrl: row.logo_url,
        minister: pickMinisterForOffice(appointmentRows, row.id, refDate),
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
