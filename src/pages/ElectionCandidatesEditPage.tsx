import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { SiteLayout } from '../components/SiteLayout'
import {
  useElectionCandidates,
  type ElectionCandidate,
} from '../hooks/useElectionCandidates'
import { useElectionParties } from '../hooks/useElectionParties'
import { getInitials, tintColor } from '../lib/hemicycle'
import { updateElectionCandidate } from '../lib/updateElectionCandidate'
import {
  enrichElectionCandidate,
  type CandidateEnrichmentUpdates,
} from '../lib/enrichElectionCandidate'
import { PartyPipelinePanel } from '../components/elections/PartyPipelinePanel'
import { EditablePartyPanel } from '../components/elections/EditablePartyPanel'
import { geocodeElectionMap } from '../lib/geocodeElectionMap'
import './ElectionPartyPage.css'
import './ElectionCandidatesEditPage.css'

const UNLOCK_STORAGE_KEY = 'elections-edit-unlocked'
const EDIT_SECRET = import.meta.env.VITE_ELECTIONS_EDIT_SECRET as
  | string
  | undefined

type CandidateDraft = {
  fullName: string
  description: string
  city: string
  imageUrl: string
  birthDate: string
  gender: string
  wikipediaUrl: string
  listPosition: string
}

type SaveState = {
  status: 'idle' | 'saving' | 'success' | 'error'
  message: string | null
}

type PipelineState = {
  status: 'idle' | 'running' | 'success' | 'warning' | 'error'
  message: string | null
}

function draftsEqual(a: CandidateDraft, b: CandidateDraft): boolean {
  return (
    a.fullName === b.fullName &&
    a.description === b.description &&
    a.city === b.city &&
    a.imageUrl === b.imageUrl &&
    a.birthDate === b.birthDate &&
    a.gender === b.gender &&
    a.wikipediaUrl === b.wikipediaUrl &&
    a.listPosition === b.listPosition
  )
}

const MISSING_FIELD_LABELS: Record<keyof CandidateDraft, string> = {
  fullName: 'שם מלא',
  description: 'תיאור',
  city: 'עיר',
  imageUrl: 'תמונה',
  birthDate: 'תאריך לידה',
  gender: 'מגדר',
  wikipediaUrl: 'ויקיפדיה',
  listPosition: 'מיקום ברשימה',
}

function getMissingFields(draft: CandidateDraft): string[] {
  const missing: string[] = []

  if (!draft.fullName.trim()) {
    missing.push(MISSING_FIELD_LABELS.fullName)
  }

  const listPosition = Number(draft.listPosition)
  if (
    !draft.listPosition.trim() ||
    !Number.isInteger(listPosition) ||
    listPosition < 1
  ) {
    missing.push(MISSING_FIELD_LABELS.listPosition)
  }

  if (!draft.description.trim()) {
    missing.push(MISSING_FIELD_LABELS.description)
  }

  if (!draft.city.trim()) {
    missing.push(MISSING_FIELD_LABELS.city)
  }

  if (!draft.imageUrl.trim()) {
    missing.push(MISSING_FIELD_LABELS.imageUrl)
  }

  if (!draft.birthDate.trim()) {
    missing.push(MISSING_FIELD_LABELS.birthDate)
  }

  if (!draft.gender.trim()) {
    missing.push(MISSING_FIELD_LABELS.gender)
  }

  if (!draft.wikipediaUrl.trim()) {
    missing.push(MISSING_FIELD_LABELS.wikipediaUrl)
  }

  return missing
}

function isDraftFieldEmpty(draft: CandidateDraft, key: keyof CandidateDraft): boolean {
  const value = draft[key]
  if (key === 'listPosition') {
    const position = Number(value)
    return !value.trim() || !Number.isInteger(position) || position < 1
  }
  return !String(value).trim()
}

function mergeEnrichmentUpdates(
  draft: CandidateDraft,
  updates: CandidateEnrichmentUpdates,
): CandidateDraft {
  const next = { ...draft }
  const keys = Object.keys(updates) as Array<keyof CandidateEnrichmentUpdates>

  for (const key of keys) {
    if (key === 'fullName' || key === 'listPosition') {
      continue
    }
    const value = updates[key]
    if (value === undefined) {
      continue
    }
    if (isDraftFieldEmpty(draft, key)) {
      next[key] = value
    }
  }

  return next
}

function formatPipelineRunningMessage(elapsedSeconds: number): string {
  if (elapsedSeconds <= 0) {
    return 'מתחיל חיפוש…'
  }
  if (elapsedSeconds === 1) {
    return 'מחפש מידע חסר… שנייה אחת'
  }
  return `מחפש מידע חסר… ${elapsedSeconds} שניות`
}

function formatPipelineRunningShort(elapsedSeconds: number): string {
  if (elapsedSeconds <= 0) {
    return 'מתחיל…'
  }
  return `${elapsedSeconds} שנ'`
}

function formatGeocodeRunningMessage(elapsedSeconds: number): string {
  if (elapsedSeconds <= 0) {
    return 'מתחיל מיפוי…'
  }
  if (elapsedSeconds === 1) {
    return 'ממפה ערים… שנייה אחת (Nominatim, ~1 עיר/שנייה)'
  }
  return `ממפה ערים… ${elapsedSeconds} שניות (Nominatim, ~1 עיר/שנייה)`
}

function isUnlockedInSession(): boolean {
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
    // Ignore storage failures; unlock still works for this page load.
  }
}

function EditableCandidateCard({
  candidate,
  partyColor,
  siblingPositions,
  onSaved,
}: {
  candidate: ElectionCandidate
  partyColor: string | null
  siblingPositions: Array<{ candidateId: number; listPosition: number }>
  onSaved: () => Promise<void>
}) {
  const {
    fullName: candidateFullName,
    description: candidateDescription,
    city: candidateCity,
    imageUrl: candidateImageUrl,
    birthDate: candidateBirthDate,
    gender: candidateGender,
    wikipediaUrl: candidateWikipediaUrl,
    listPosition: candidateListPosition,
  } = candidate

  const baseline = useMemo(
    (): CandidateDraft => ({
      fullName: candidateFullName,
      description: candidateDescription ?? '',
      city: candidateCity ?? '',
      imageUrl: candidateImageUrl ?? '',
      birthDate: candidateBirthDate?.slice(0, 10) ?? '',
      gender: candidateGender ?? '',
      wikipediaUrl: candidateWikipediaUrl ?? '',
      listPosition: String(candidateListPosition),
    }),
    [
      candidateFullName,
      candidateDescription,
      candidateCity,
      candidateImageUrl,
      candidateBirthDate,
      candidateGender,
      candidateWikipediaUrl,
      candidateListPosition,
    ],
  )
  const [draft, setDraft] = useState<CandidateDraft>(baseline)
  const [expanded, setExpanded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({
    status: 'idle',
    message: null,
  })
  const [pipelineState, setPipelineState] = useState<PipelineState>({
    status: 'idle',
    message: null,
  })
  const [pipelineElapsedSeconds, setPipelineElapsedSeconds] = useState(0)

  useEffect(() => {
    setDraft(baseline)
    setSaveState({ status: 'idle', message: null })
    setPipelineState({ status: 'idle', message: null })
    setPipelineElapsedSeconds(0)
  }, [baseline])

  useEffect(() => {
    if (pipelineState.status !== 'running') {
      return
    }

    const timer = window.setInterval(() => {
      setPipelineElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [pipelineState.status])

  const dirty = !draftsEqual(draft, baseline)
  const accentColor = partyColor ?? '#4890fd'
  const style = {
    '--party-color': accentColor,
    '--party-soft': tintColor(accentColor, 0.18),
  } as CSSProperties

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saveState.status === 'saving') {
      return
    }

    if (!dirty) {
      setSaveState({ status: 'error', message: 'אין שינויים לשמירה' })
      return
    }

    const form = event.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      setSaveState({
        status: 'error',
        message: 'יש לתקן את השדות המסומנים לפני השמירה',
      })
      return
    }

    const listPosition = Number(draft.listPosition)
    setSaveState({ status: 'saving', message: null })

    const result = await updateElectionCandidate({
      candidateId: candidate.id,
      personId: candidate.personId,
      partyId: candidate.partyId,
      fullName: draft.fullName,
      description: draft.description,
      city: draft.city,
      imageUrl: draft.imageUrl,
      birthDate: draft.birthDate,
      gender: draft.gender || null,
      wikipediaUrl: draft.wikipediaUrl,
      listPosition,
      previousCity: candidate.city,
      siblingPositions,
    })

    if (!result.ok) {
      setSaveState({ status: 'error', message: result.error })
      return
    }

    setSaveState({ status: 'success', message: 'נשמר בהצלחה' })
    await onSaved()
  }

  function updateField<K extends keyof CandidateDraft>(
    key: K,
    value: CandidateDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (saveState.status !== 'idle') {
      setSaveState({ status: 'idle', message: null })
    }
  }

  async function handleEnrich(event?: MouseEvent) {
    event?.stopPropagation()

    if (
      pipelineState.status === 'running' ||
      saveState.status === 'saving' ||
      missingFields.length === 0
    ) {
      return
    }

    setExpanded(true)
    setPipelineElapsedSeconds(0)
    setPipelineState({ status: 'running', message: null })

    try {
      const result = await enrichElectionCandidate(candidate.id)

      if (!result.ok) {
        setPipelineState({ status: 'error', message: result.error })
        return
      }

      if (result.filledFields.length === 0) {
        setPipelineState({
          status: 'warning',
          message: result.message ?? 'לא נמצא מידע נוסף במקורות — נסו למלא ידנית',
        })
        return
      }

      setDraft((current) => mergeEnrichmentUpdates(current, result.updates))
      setPipelineState({
        status: 'success',
        message: `${result.message ?? `הושלמו ${result.filledFields.length} שדות`} — בדקו ושמרו`,
      })
    } catch {
      setPipelineState({
        status: 'error',
        message: 'שגיאה בתקשורת עם שרת הפיתוח — בדקו ש-npm run dev פעיל',
      })
    }
  }

  const previewImage = draft.imageUrl.trim() || null
  const displayName = draft.fullName || candidate.fullName
  const missingFields = useMemo(() => getMissingFields(draft), [draft])
  const pipelineRunning = pipelineState.status === 'running'
  const showEnrichButton =
    import.meta.env.DEV &&
    missingFields.length > 0 &&
    saveState.status !== 'saving'
  const canClickEnrich = showEnrichButton && !pipelineRunning
  const pipelineRunningMessage = formatPipelineRunningMessage(pipelineElapsedSeconds)
  const pipelineRunningShort = formatPipelineRunningShort(pipelineElapsedSeconds)

  return (
    <li
      className={`candidate-card candidate-edit-card${expanded ? ' candidate-edit-card--expanded' : ''}${pipelineRunning ? ' candidate-edit-card--pipeline-running' : ''}`}
      style={style}
    >
      <div className="candidate-edit-card__summary-row">
        <button
          type="button"
          className="candidate-edit-card__summary"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={`candidate-edit-form-${candidate.id}`}
        >
          <span className="candidate-card__position">{draft.listPosition || '—'}</span>

          {previewImage ? (
            <img
              className="candidate-card__photo"
              src={previewImage}
              alt=""
              loading="lazy"
            />
          ) : (
            <span className="candidate-card__photo candidate-card__photo--initials">
              {getInitials(displayName)}
            </span>
          )}

          <span className="candidate-edit-card__summary-body">
            <span className="candidate-card__name">{displayName}</span>
            {!expanded && missingFields.length > 0 ? (
              <span className="candidate-edit-card__missing">
                חסר: {missingFields.join(' · ')}
              </span>
            ) : null}
            {dirty ? (
              <span className="candidate-edit-card__dirty">יש שינויים לא שמורים</span>
            ) : null}
            {pipelineRunning ? (
              <span
                className="candidate-edit-card__pipeline-running"
                role="status"
                aria-live="polite"
              >
                <span className="candidate-edit-card__pipeline-spinner" aria-hidden="true" />
                {pipelineRunningMessage}
              </span>
            ) : null}
            {!pipelineRunning && pipelineState.message ? (
              <span
                className={
                  pipelineState.status === 'error'
                    ? 'candidate-edit-card__pipeline-status candidate-edit-card__pipeline-status--error'
                    : pipelineState.status === 'warning'
                      ? 'candidate-edit-card__pipeline-status candidate-edit-card__pipeline-status--warning'
                      : 'candidate-edit-card__pipeline-status'
                }
              >
                {pipelineState.message}
              </span>
            ) : null}
          </span>

          <span className="candidate-edit-card__chevron" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </button>

        {showEnrichButton ? (
          <button
            type="button"
            className="candidate-edit-card__enrich candidate-edit-card__enrich--summary"
            onClick={handleEnrich}
            disabled={!canClickEnrich}
            aria-busy={pipelineRunning}
          >
            {pipelineRunning ? pipelineRunningShort : 'השלם מידע'}
          </button>
        ) : null}
      </div>

      {expanded ? (
        <form
          id={`candidate-edit-form-${candidate.id}`}
          className="candidate-edit-card__form"
          onSubmit={handleSave}
          noValidate
        >
          <label className="candidate-edit-card__field">
            <span>שם מלא</span>
            <input
              type="text"
              value={draft.fullName}
              onChange={(event) => updateField('fullName', event.target.value)}
              required
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>מיקום ברשימה</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draft.listPosition}
              onChange={(event) => updateField('listPosition', event.target.value)}
              required
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>עיר</span>
            <input
              type="text"
              value={draft.city}
              onChange={(event) => updateField('city', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>תאריך לידה</span>
            <input
              type="date"
              value={draft.birthDate}
              onChange={(event) => updateField('birthDate', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>מגדר</span>
            <select
              value={draft.gender}
              onChange={(event) => updateField('gender', event.target.value)}
            >
              <option value="">לא ידוע</option>
              <option value="זכר">זכר</option>
              <option value="נקבה">נקבה</option>
            </select>
          </label>

          <label className="candidate-edit-card__field candidate-edit-card__field--wide">
            <span>תמונה (URL)</span>
            <input
              type="text"
              value={draft.imageUrl}
              onChange={(event) => updateField('imageUrl', event.target.value)}
              dir="ltr"
              placeholder="https://…"
            />
          </label>

          <label className="candidate-edit-card__field candidate-edit-card__field--wide">
            <span>ויקיפדיה (URL)</span>
            <input
              type="text"
              value={draft.wikipediaUrl}
              onChange={(event) => updateField('wikipediaUrl', event.target.value)}
              dir="ltr"
              placeholder="https://he.wikipedia.org/wiki/…"
            />
          </label>

          <label className="candidate-edit-card__field candidate-edit-card__field--wide">
            <span>תיאור</span>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </label>

          <div className="candidate-edit-card__actions">
            {pipelineRunning ? (
              <p
                className="candidate-edit-card__pipeline-running candidate-edit-card__pipeline-running--actions"
                role="status"
                aria-live="polite"
              >
                <span className="candidate-edit-card__pipeline-spinner" aria-hidden="true" />
                {pipelineRunningMessage}
              </p>
            ) : null}
            {showEnrichButton ? (
              <button
                type="button"
                className="candidate-edit-card__enrich"
                onClick={handleEnrich}
                disabled={!canClickEnrich}
                aria-busy={pipelineRunning}
              >
                {pipelineRunning ? pipelineRunningShort : 'השלם מידע'}
              </button>
            ) : null}
            <button
              type="submit"
              className="candidate-edit-card__save"
              disabled={saveState.status === 'saving'}
            >
              {saveState.status === 'saving' ? 'שומר…' : 'שמור'}
            </button>
            <button
              type="button"
              className="candidate-edit-card__collapse"
              onClick={() => setExpanded(false)}
            >
              סגור
            </button>
            {saveState.message ? (
              <p
                className={
                  saveState.status === 'error'
                    ? 'candidate-edit-card__status candidate-edit-card__status--error'
                    : 'candidate-edit-card__status'
                }
                role={saveState.status === 'error' ? 'alert' : undefined}
              >
                {saveState.message}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </li>
  )
}

export function ElectionCandidatesEditPage() {
  const [unlocked, setUnlocked] = useState(isUnlockedInSession)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null)
  const [mapGeocodeState, setMapGeocodeState] = useState<PipelineState>({
    status: 'idle',
    message: null,
  })
  const [mapGeocodeElapsedSeconds, setMapGeocodeElapsedSeconds] = useState(0)

  const {
    parties,
    loading: partiesLoading,
    error: partiesError,
    refetch: refetchParties,
  } = useElectionParties()
  const {
    candidates,
    loading: candidatesLoading,
    error: candidatesError,
    refetch,
  } = useElectionCandidates(selectedPartyId)

  useEffect(() => {
    if (selectedPartyId !== null || parties.length === 0) {
      return
    }
    setSelectedPartyId(parties[0].id)
  }, [parties, selectedPartyId])

  useEffect(() => {
    setMapGeocodeState({ status: 'idle', message: null })
    setMapGeocodeElapsedSeconds(0)
  }, [selectedPartyId])

  useEffect(() => {
    if (mapGeocodeState.status !== 'running') {
      return
    }

    const timer = window.setInterval(() => {
      setMapGeocodeElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [mapGeocodeState.status])

  const selectedParty =
    selectedPartyId === null
      ? null
      : (parties.find((party) => party.id === selectedPartyId) ?? null)

  const siblingPositions = useMemo(
    () =>
      candidates.map((candidate) => ({
        candidateId: candidate.id,
        listPosition: candidate.listPosition,
      })),
    [candidates],
  )

  const accentColor = selectedParty?.color ?? '#4890fd'
  const style = { '--party-color': accentColor } as CSSProperties
  const secretConfigured = Boolean(EDIT_SECRET && EDIT_SECRET.length > 0)
  const showPartyPipeline =
    import.meta.env.DEV &&
    secretConfigured &&
    unlocked &&
    selectedParty !== null &&
    !candidatesLoading &&
    candidates.length <= 2

  const candidatesNeedingGeocode = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.city?.trim() &&
          (candidate.latitude === null || candidate.longitude === null),
      ),
    [candidates],
  )

  const showMapGeocodeButton =
    import.meta.env.DEV &&
    secretConfigured &&
    unlocked &&
    selectedParty !== null &&
    !candidatesLoading

  const mapGeocodeRunning = mapGeocodeState.status === 'running'
  const canClickMapGeocode =
    showMapGeocodeButton &&
    !mapGeocodeRunning &&
    candidatesNeedingGeocode.length > 0

  async function handleGeocodeMap() {
    if (!selectedPartyId || !canClickMapGeocode) {
      return
    }

    setMapGeocodeElapsedSeconds(0)
    setMapGeocodeState({ status: 'running', message: null })

    try {
      const result = await geocodeElectionMap(selectedPartyId)

      if (!result.ok) {
        setMapGeocodeState({ status: 'error', message: result.error })
        return
      }

      await refetch()

      if (result.total === 0) {
        setMapGeocodeState({
          status: 'success',
          message: result.message ?? 'כל המועמדים עם עיר כבר ממופים',
        })
        return
      }

      const failedSuffix =
        result.failed > 0 ? ` · ${result.failed} ערים לא נמצאו` : ''

      setMapGeocodeState({
        status: result.failed > 0 && result.geocoded === 0 ? 'warning' : 'success',
        message: `${result.message ?? `ממפו ${result.geocoded} מועמדים`}${failedSuffix}`,
      })
    } catch {
      setMapGeocodeState({
        status: 'error',
        message: 'שגיאה בתקשורת עם שרת הפיתוח — בדקו ש-npm run dev פעיל',
      })
    }
  }

  function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (!secretConfigured) {
      setPasswordError('חסר VITE_ELECTIONS_EDIT_SECRET בקובץ .env')
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

  return (
    <SiteLayout className="election-edit-page">
      <main className="election-edit-page__main" style={style}>
        <header className="election-edit-page__hero">
          <div className="election-edit-page__inner container">
            <Link to="/elections" className="election-edit-page__back">
              חזרה לבחירות
            </Link>
            <p className="election-edit-page__eyebrow">עריכת מועמדים</p>
            <h1 className="election-edit-page__title">עריכת רשימות המועמדים</h1>
            <p className="election-edit-page__subtitle">
              עדכון ישיר של פרטי מועמדים קיימים במסד הנתונים.
            </p>
          </div>
        </header>

        <section className="election-edit-page__content">
          <div className="election-edit-page__inner container">
            {!secretConfigured ? (
              <p className="election-edit-page__panel" role="alert">
                חסר VITE_ELECTIONS_EDIT_SECRET בקובץ .env — הוסיפו את המשתנה
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
                  <p className="candidate-edit-card__status candidate-edit-card__status--error" role="alert">
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
                <div className="election-edit-page__toolbar party-detail-card">
                  <div className="party-detail-card__header">
                    <p className="party-detail-card__eyebrow">מפלגה</p>
                    <h2 className="party-detail-card__title">בחרו מפלגה לעריכה</h2>
                  </div>
                  <label className="election-edit-page__picker">
                    <span className="visually-hidden">מפלגה</span>
                    <select
                      className="election-edit-page__picker-select"
                      value={selectedPartyId ?? ''}
                      disabled={partiesLoading || parties.length === 0}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setSelectedPartyId(Number.isFinite(next) ? next : null)
                      }}
                    >
                      {partiesLoading ? (
                        <option value="">טוען מפלגות…</option>
                      ) : null}
                      {!partiesLoading && parties.length === 0 ? (
                        <option value="">אין מפלגות</option>
                      ) : null}
                      {parties.map((party) => (
                        <option key={party.id} value={party.id}>
                          {party.shortName ?? party.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {showMapGeocodeButton ? (
                    <div className="election-edit-page__map-geocode">
                      <p className="election-edit-page__map-geocode-hint">
                        {candidatesNeedingGeocode.length > 0
                          ? `${candidatesNeedingGeocode.length} מועמדים עם עיר ללא קואורדינטות — יופיעו במפה אחרי עדכון`
                          : 'כל המועמדים עם עיר כבר ממופים'}
                      </p>
                      <div className="election-edit-page__map-geocode-actions">
                        <button
                          type="button"
                          className="candidate-edit-card__enrich"
                          onClick={handleGeocodeMap}
                          disabled={!canClickMapGeocode}
                          aria-busy={mapGeocodeRunning}
                        >
                          {mapGeocodeRunning
                            ? formatGeocodeRunningMessage(mapGeocodeElapsedSeconds)
                            : 'עדכן מפה'}
                        </button>
                        {mapGeocodeRunning ? (
                          <span
                            className="candidate-edit-card__pipeline-spinner election-edit-page__map-geocode-spinner"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      {mapGeocodeState.message ? (
                        <p
                          className={
                            mapGeocodeState.status === 'error'
                              ? 'candidate-edit-card__pipeline-status candidate-edit-card__pipeline-status--error'
                              : mapGeocodeState.status === 'warning'
                                ? 'candidate-edit-card__pipeline-status candidate-edit-card__pipeline-status--warning'
                                : 'candidate-edit-card__pipeline-status'
                          }
                          role={
                            mapGeocodeState.status === 'error' ? 'alert' : undefined
                          }
                        >
                          {mapGeocodeState.message}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {partiesError || candidatesError ? (
                  <p className="election-edit-page__panel" role="alert">
                    לא ניתן לטעון את נתוני המועמדים
                  </p>
                ) : null}

                {!partiesError && !candidatesError ? (
                  <>
                    {selectedParty ? (
                      <EditablePartyPanel
                        party={selectedParty}
                        onSaved={refetchParties}
                      />
                    ) : null}

                    {showPartyPipeline && selectedParty ? (
                      <PartyPipelinePanel
                        party={selectedParty}
                        onComplete={refetch}
                      />
                    ) : null}

                    <section
                      className="party-detail-card candidate-list"
                      aria-labelledby="candidate-edit-list-title"
                    >
                    <div className="party-detail-card__header">
                      <p className="party-detail-card__eyebrow">הרשימה</p>
                      <h2
                        id="candidate-edit-list-title"
                        className="party-detail-card__title"
                      >
                        {selectedParty
                          ? `עריכת מועמדי ${selectedParty.shortName ?? selectedParty.name}`
                          : 'מועמדים'}
                      </h2>
                    </div>

                    {candidatesLoading ? (
                      <p className="election-edit-page__muted">טוען מועמדים…</p>
                    ) : null}

                    {!candidatesLoading && candidates.length === 0 ? (
                      <p className="candidate-list__empty">
                        אין מועמדים למפלגה זו במסד הנתונים.
                      </p>
                    ) : null}

                    {!candidatesLoading && candidates.length > 0 ? (
                      <ol className="candidate-list__grid candidate-edit-list">
                        {candidates.map((candidate) => (
                          <EditableCandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            partyColor={selectedParty?.color ?? null}
                            siblingPositions={siblingPositions}
                            onSaved={refetch}
                          />
                        ))}
                      </ol>
                    ) : null}
                  </section>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}
