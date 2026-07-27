import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { SiteLayout } from '../components/SiteLayout'
import { KnessetPipelinePanel } from '../components/knesset/KnessetPipelinePanel'
import { KnessetRunSummary } from '../components/knesset/KnessetRunSummary'
import {
  formatKnessetLabel,
  useKnessetList,
} from '../hooks/useKnessetList'
import type { KnessetOption } from '../lib/supabase'
import {
  useKnessetFactions,
  type KnessetFactionOption,
} from '../hooks/useKnessetFactions'
import { tintColor } from '../lib/hemicycle'
import {
  fetchKnessetStatus,
  KNESSET_STAGE_LABELS,
  type KnessetTableCounts,
  type PipelineRunSummary,
} from '../lib/runKnessetPipeline'
import { updateKnessetFaction } from '../lib/updateKnessetFaction'
import './ElectionPartyPage.css'
import './ElectionCandidatesEditPage.css'
import './KnessetPipelineEditPage.css'

const UNLOCK_STORAGE_KEY = 'knesset-edit-unlocked'
const EDIT_SECRET = import.meta.env.VITE_KNESSET_EDIT_SECRET as string | undefined

function formatLastPipelineRun(
  lastRunAt: string | null,
  action: string | null,
  stage: number | null,
): string {
  if (!lastRunAt) {
    return 'טרם הורץ'
  }

  const formatted = new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(lastRunAt))

  if (action === 'stage' && stage !== null) {
    return `${formatted} (שלב ${stage}: ${KNESSET_STAGE_LABELS[stage] ?? stage})`
  }

  if (action === 'faction-apply') {
    return `${formatted} (קישורי סיעות)`
  }

  if (action === 'images') {
    return `${formatted} (תמונות)`
  }

  return formatted
}

const TABLE_LABELS: Record<keyof KnessetTableCounts, string> = {
  knessets: 'כנסות',
  people: 'אנשים',
  knesset_factions: 'סיעות',
  offices: 'משרדים',
  governments: 'ממשלות',
  knesset_memberships: 'חברויות',
  minister_appointments: 'מינויים',
}

type FactionDraft = {
  shortName: string
  color: string
  logoUrl: string
  isCoalition: boolean | null
}

type SaveState = {
  status: 'idle' | 'saving' | 'success' | 'error'
  message: string | null
}

function getUnlockedFromSession(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function setUnlockedInSession(): void {
  try {
    sessionStorage.setItem(UNLOCK_STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

function factionToDraft(faction: KnessetFactionOption): FactionDraft {
  return {
    shortName: faction.shortName ?? '',
    color: faction.color ?? '',
    logoUrl: faction.logoUrl ?? '',
    isCoalition: faction.isCoalition,
  }
}

function draftsEqual(a: FactionDraft, b: FactionDraft): boolean {
  return (
    a.shortName === b.shortName &&
    a.color === b.color &&
    a.logoUrl === b.logoUrl &&
    a.isCoalition === b.isCoalition
  )
}

function EditableFactionCard({
  faction,
  isActiveTerm,
  onSaved,
}: {
  faction: KnessetFactionOption
  isActiveTerm: boolean
  onSaved: () => Promise<void>
}) {
  const baseline = useMemo(() => factionToDraft(faction), [faction])
  const [draft, setDraft] = useState<FactionDraft>(baseline)
  const [expanded, setExpanded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({
    status: 'idle',
    message: null,
  })

  useEffect(() => {
    setDraft(baseline)
    setSaveState({ status: 'idle', message: null })
  }, [baseline])

  const dirty = !draftsEqual(draft, baseline)
  const accentColor = draft.color.trim() || '#4890fd'
  const style = {
    '--party-color': accentColor,
    '--party-soft': tintColor(accentColor, 0.18),
  } as CSSProperties

  const missingColor = isActiveTerm && !draft.color.trim()
  const missingCoalition = isActiveTerm && draft.isCoalition === null

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saveState.status === 'saving' || !dirty) {
      return
    }

    setSaveState({ status: 'saving', message: null })

    const result = await updateKnessetFaction({
      factionId: faction.id,
      shortName: draft.shortName.trim() || null,
      color: draft.color.trim() || null,
      isCoalition: draft.isCoalition ?? false,
      logoUrl: draft.logoUrl.trim() || null,
    })

    if (!result.ok) {
      setSaveState({ status: 'error', message: result.error })
      return
    }

    setSaveState({ status: 'success', message: 'נשמר בהצלחה' })
    await onSaved()
  }

  function updateField<K extends keyof FactionDraft>(key: K, value: FactionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (saveState.status !== 'idle') {
      setSaveState({ status: 'idle', message: null })
    }
  }

  const displayName = faction.shortName || faction.name || 'סיעה'

  return (
    <li
      className={`candidate-card candidate-edit-card faction-edit-card${expanded ? ' candidate-edit-card--expanded' : ''}`}
      style={style}
    >
      <div className="candidate-edit-card__summary-row">
        <button
          type="button"
          className="candidate-edit-card__summary"
          onClick={() => setExpanded((current) => !current)}
        >
          <span
            className="faction-edit-card__swatch"
            style={{ background: accentColor }}
            aria-hidden="true"
          />
          <span className="candidate-edit-card__summary-body">
            <span className="candidate-card__name">{displayName}</span>
            {faction.name && faction.shortName !== faction.name ? (
              <span className="faction-edit-card__full-name">{faction.name}</span>
            ) : null}
            {draft.isCoalition === true ? (
              <span className="faction-edit-card__badge faction-edit-card__badge--coalition">
                קואליציה
              </span>
            ) : null}
            {missingColor || missingCoalition ? (
              <span className="candidate-edit-card__missing">
                חסר:{' '}
                {[missingColor && 'צבע', missingCoalition && 'קואליציה']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
            {dirty ? (
              <span className="candidate-edit-card__dirty">
                יש שינויים לא שמורים
              </span>
            ) : null}
          </span>
          <span className="candidate-edit-card__chevron" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </button>
      </div>

      {expanded ? (
        <form className="candidate-edit-card__form" onSubmit={handleSave}>
          <label className="candidate-edit-card__field">
            <span>שם קצר</span>
            <input
              type="text"
              value={draft.shortName}
              onChange={(event) => updateField('shortName', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>צבע (hex)</span>
            <div className="faction-edit-card__color-row">
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(draft.color)
                    ? draft.color
                    : '#4890fd'
                }
                onChange={(event) => updateField('color', event.target.value)}
                aria-label="בחירת צבע"
              />
              <input
                type="text"
                value={draft.color}
                placeholder="#4890fd"
                onChange={(event) => updateField('color', event.target.value)}
              />
            </div>
          </label>

          <label className="candidate-edit-card__field faction-edit-card__checkbox">
            <input
              type="checkbox"
              checked={draft.isCoalition === true}
              onChange={(event) =>
                updateField('isCoalition', event.target.checked)
              }
            />
            <span>חלק מהקואליציה</span>
          </label>

          <label className="candidate-edit-card__field">
            <span>קישור לוגו</span>
            <input
              type="url"
              value={draft.logoUrl}
              onChange={(event) => updateField('logoUrl', event.target.value)}
            />
          </label>

          {saveState.message ? (
            <p
              className={`candidate-edit-card__status candidate-edit-card__status--${saveState.status}`}
              role={saveState.status === 'error' ? 'alert' : 'status'}
            >
              {saveState.message}
            </p>
          ) : null}

          <div className="candidate-edit-card__actions">
            <button
              type="submit"
              className="candidate-edit-card__save"
              disabled={saveState.status === 'saving' || !dirty}
            >
              {saveState.status === 'saving' ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </form>
      ) : null}
    </li>
  )
}

export function KnessetPipelineEditPage() {
  const secretConfigured = Boolean(EDIT_SECRET)
  const [unlocked, setUnlocked] = useState(() => getUnlockedFromSession())
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const { knessets, loading: listLoading } = useKnessetList()
  const [selectedKnesset, setSelectedKnesset] = useState<KnessetOption | null>(
    null,
  )

  const {
    factions,
    loading: factionsLoading,
    error: factionsError,
    refetch: refetchFactions,
  } = useKnessetFactions(selectedKnesset?.id ?? null)

  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [tableCounts, setTableCounts] = useState<KnessetTableCounts | null>(
    null,
  )
  const [membershipsMissingFaction, setMembershipsMissingFaction] = useState<
    number | null
  >(null)
  const [lastPipelineRunAt, setLastPipelineRunAt] = useState<string | null>(
    null,
  )
  const [lastPipelineAction, setLastPipelineAction] = useState<string | null>(
    null,
  )
  const [lastPipelineStage, setLastPipelineStage] = useState<number | null>(
    null,
  )
  const [lastRunSummary, setLastRunSummary] = useState<PipelineRunSummary | null>(
    null,
  )

  useEffect(() => {
    if (selectedKnesset || knessets.length === 0) {
      return
    }

    const defaultTerm =
      knessets.find((term) => term.isActive) ?? knessets[0] ?? null
    setSelectedKnesset(defaultTerm)
  }, [knessets, selectedKnesset])

  async function loadStatus() {
    if (!import.meta.env.DEV) {
      return
    }

    setStatusLoading(true)
    setStatusError(null)

    const result = await fetchKnessetStatus()
    if (!result.ok) {
      setStatusError(result.error)
      setTableCounts(null)
      setMembershipsMissingFaction(null)
      setLastPipelineRunAt(null)
      setLastPipelineAction(null)
      setLastPipelineStage(null)
      setLastRunSummary(null)
      setStatusLoading(false)
      return
    }

    setTableCounts(result.tables)
    setMembershipsMissingFaction(result.membershipsMissingFaction)
    setLastPipelineRunAt(result.lastPipelineRunAt)
    setLastPipelineAction(result.lastPipelineAction)
    setLastPipelineStage(result.lastPipelineStage ?? null)
    setLastRunSummary(result.lastRunSummary ?? null)
    setStatusLoading(false)
  }

  useEffect(() => {
    if (secretConfigured && unlocked) {
      void loadStatus()
    }
  }, [secretConfigured, unlocked])

  async function handlePipelineComplete() {
    await loadStatus()
    await refetchFactions()
  }

  function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (!secretConfigured) {
      setPasswordError('חסר VITE_KNESSET_EDIT_SECRET בקובץ .env')
      return
    }
    if (password !== EDIT_SECRET) {
      setPasswordError('סיסמה שגויה')
      return
    }
    setUnlockedInSession()
    setUnlocked(true)
    setPasswordError(null)
    setPassword('')
  }

  const isActiveTerm = selectedKnesset?.isActive ?? false

  return (
    <SiteLayout className="election-edit-page">
      <main className="election-edit-page__main">
        <header className="election-edit-page__hero">
          <div className="election-edit-page__inner container">
            <Link to="/knesset" className="election-edit-page__back">
              חזרה לכנסת
            </Link>
            <p className="election-edit-page__eyebrow">עדכון נתונים</p>
            <h1 className="election-edit-page__title">עדכון נתוני הכנסת</h1>
            <p className="election-edit-page__subtitle">
              הרצת צינור הסנכרון ועריכת מטא-דאטה של סיעות (צבע, קואליציה, שם קצר).
            </p>
          </div>
        </header>

        <section className="election-edit-page__content">
          <div className="election-edit-page__inner container">
            {!secretConfigured ? (
              <p className="election-edit-page__panel" role="alert">
                חסר VITE_KNESSET_EDIT_SECRET בקובץ .env — הוסיפו את המשתנה
                והפעילו מחדש את שרת הפיתוח.
              </p>
            ) : null}

            {secretConfigured && !unlocked ? (
              <form
                className="election-edit-page__gate party-detail-card"
                onSubmit={handleUnlock}
              >
                <div className="party-detail-card__header">
                  <p className="party-detail-card__eyebrow">גישה</p>
                  <h2 className="party-detail-card__title">הזינו סיסמה</h2>
                </div>
                <label className="candidate-edit-card__field">
                  <span>סיסמה</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setPasswordError(null)
                    }}
                    autoComplete="current-password"
                    required
                  />
                </label>
                {passwordError ? (
                  <p
                    className="candidate-edit-card__status candidate-edit-card__status--error"
                    role="alert"
                  >
                    {passwordError}
                  </p>
                ) : null}
                <button type="submit" className="candidate-edit-card__save">
                  כניסה
                </button>
              </form>
            ) : null}

            {secretConfigured && unlocked ? (
              <>
                <section
                  className="party-detail-card knesset-status-panel"
                  aria-labelledby="knesset-status-title"
                >
                  <div className="party-detail-card__header">
                    <p className="party-detail-card__eyebrow">סטטוס</p>
                    <h2 id="knesset-status-title" className="party-detail-card__title">
                      מצב המסד הנתונים
                    </h2>
                    <p className="knesset-status-panel__last-run">
                      הרצה אחרונה:{' '}
                      {formatLastPipelineRun(
                        lastPipelineRunAt,
                        lastPipelineAction,
                        lastPipelineStage,
                      )}
                    </p>
                    <KnessetRunSummary
                      summary={lastRunSummary}
                      title="סיכום הרצה אחרונה"
                    />
                  </div>

                  {statusLoading ? (
                    <p className="election-edit-page__muted">טוען סטטוס…</p>
                  ) : null}

                  {statusError ? (
                    <p
                      className="candidate-edit-card__status candidate-edit-card__status--error"
                      role="alert"
                    >
                      {statusError}
                    </p>
                  ) : null}

                  {tableCounts ? (
                    <div className="knesset-status-panel__grid">
                      {(Object.keys(TABLE_LABELS) as Array<
                        keyof KnessetTableCounts
                      >).map((key) => (
                        <div key={key} className="knesset-status-panel__item">
                          <span className="knesset-status-panel__label">
                            {TABLE_LABELS[key]}
                          </span>
                          <span className="knesset-status-panel__value">
                            {tableCounts[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {membershipsMissingFaction !== null &&
                  membershipsMissingFaction > 0 ? (
                    <p className="knesset-status-panel__alert">
                      {membershipsMissingFaction} חברויות ללא קישור סיעה
                      (faction_id ריק)
                    </p>
                  ) : null}

                  {import.meta.env.DEV ? (
                    <button
                      type="button"
                      className="candidate-edit-card__collapse"
                      disabled={statusLoading}
                      onClick={() => void loadStatus()}
                    >
                      רענן סטטוס
                    </button>
                  ) : null}
                </section>

                {import.meta.env.DEV ? (
                  <KnessetPipelinePanel onComplete={handlePipelineComplete} />
                ) : null}

                <section
                  className="party-detail-card"
                  aria-labelledby="knesset-factions-title"
                >
                  <div className="party-detail-card__header">
                    <p className="party-detail-card__eyebrow">סיעות</p>
                    <h2 id="knesset-factions-title" className="party-detail-card__title">
                      עריכת מטא-דאטה סיעות
                    </h2>
                  </div>

                  <label className="election-edit-page__picker">
                    <span className="visually-hidden">כנסת</span>
                    <select
                      className="election-edit-page__picker-select"
                      value={selectedKnesset?.id ?? ''}
                      disabled={listLoading || knessets.length === 0}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        const term =
                          knessets.find((k) => k.id === next) ?? null
                        setSelectedKnesset(term)
                      }}
                    >
                      {knessets.map((term) => (
                        <option key={term.id} value={term.id}>
                          {formatKnessetLabel(term)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {factionsLoading ? (
                    <p className="election-edit-page__muted">טוען סיעות…</p>
                  ) : null}

                  {factionsError ? (
                    <p
                      className="candidate-edit-card__status candidate-edit-card__status--error"
                      role="alert"
                    >
                      {factionsError}
                    </p>
                  ) : null}

                  {!factionsLoading && factions.length === 0 ? (
                    <p className="election-edit-page__muted">
                      לא נמצאו סיעות לכנסת שנבחרה.
                    </p>
                  ) : null}

                  <ul className="candidate-list">
                    {factions.map((faction) => (
                      <EditableFactionCard
                        key={faction.id}
                        faction={faction}
                        isActiveTerm={isActiveTerm}
                        onSaved={refetchFactions}
                      />
                    ))}
                  </ul>
                </section>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}
