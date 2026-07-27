import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import type { ElectionParty } from '../../lib/supabase'
import { tintColor } from '../../lib/hemicycle'
import { updateElectionParty } from '../../lib/updateElectionParty'

type PartyDraft = {
  name: string
  shortName: string
  color: string
  logoUrl: string
  ballotLetter: string
  description: string
}

type SaveState = {
  status: 'idle' | 'saving' | 'success' | 'error'
  message: string | null
}

const MISSING_FIELD_LABELS: Record<keyof PartyDraft, string> = {
  name: 'שם מלא',
  shortName: 'שם קצר',
  color: 'צבע',
  logoUrl: 'לוגו',
  ballotLetter: 'אות על גלגלת',
  description: 'תיאור',
}

function partyToDraft(party: ElectionParty): PartyDraft {
  return {
    name: party.name,
    shortName: party.shortName ?? '',
    color: party.color ?? '',
    logoUrl: party.logoUrl ?? '',
    ballotLetter: party.ballotLetter ?? '',
    description: party.description ?? '',
  }
}

function draftsEqual(a: PartyDraft, b: PartyDraft): boolean {
  return (
    a.name === b.name &&
    a.shortName === b.shortName &&
    a.color === b.color &&
    a.logoUrl === b.logoUrl &&
    a.ballotLetter === b.ballotLetter &&
    a.description === b.description
  )
}

function getMissingFields(draft: PartyDraft): string[] {
  const missing: string[] = []

  if (!draft.name.trim()) {
    missing.push(MISSING_FIELD_LABELS.name)
  }

  if (!draft.shortName.trim()) {
    missing.push(MISSING_FIELD_LABELS.shortName)
  }

  if (!draft.color.trim()) {
    missing.push(MISSING_FIELD_LABELS.color)
  }

  if (!draft.logoUrl.trim()) {
    missing.push(MISSING_FIELD_LABELS.logoUrl)
  }

  if (!draft.description.trim()) {
    missing.push(MISSING_FIELD_LABELS.description)
  }

  return missing
}

type EditablePartyPanelProps = {
  party: ElectionParty
  onSaved: () => Promise<void>
}

export function EditablePartyPanel({ party, onSaved }: EditablePartyPanelProps) {
  const baseline = useMemo(() => partyToDraft(party), [party])
  const [draft, setDraft] = useState<PartyDraft>(baseline)
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
  const accentColor = draft.color.trim() || party.color || '#4890fd'
  const style = {
    '--party-color': accentColor,
    '--party-soft': tintColor(accentColor, 0.18),
  } as CSSProperties
  const missingFields = getMissingFields(draft)
  const displayName = draft.shortName.trim() || draft.name.trim() || party.name

  function updateField<K extends keyof PartyDraft>(key: K, value: PartyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (saveState.status !== 'idle') {
      setSaveState({ status: 'idle', message: null })
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saveState.status === 'saving' || !dirty) {
      return
    }

    setSaveState({ status: 'saving', message: null })

    const result = await updateElectionParty({
      partyId: party.id,
      name: draft.name.trim(),
      shortName: draft.shortName.trim() || null,
      color: draft.color.trim() || null,
      logoUrl: draft.logoUrl.trim() || null,
      ballotLetter: draft.ballotLetter.trim() || null,
      description: draft.description.trim() || null,
    })

    if (!result.ok) {
      setSaveState({ status: 'error', message: result.error })
      return
    }

    setSaveState({ status: 'success', message: 'נשמר בהצלחה' })
    await onSaved()
  }

  return (
    <section
      className={`party-detail-card party-edit-panel${expanded ? ' party-edit-panel--expanded' : ''}`}
      style={style}
      aria-labelledby="party-edit-panel-title"
    >
      <button
        type="button"
        className="party-edit-panel__summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span
          className="party-edit-panel__swatch"
          style={{ background: accentColor }}
          aria-hidden="true"
        />
        <span className="party-edit-panel__summary-body">
          <span className="party-edit-panel__title" id="party-edit-panel-title">
            {displayName}
          </span>
          {draft.name.trim() && draft.shortName.trim() !== draft.name.trim() ? (
            <span className="party-edit-panel__full-name">{draft.name}</span>
          ) : null}
          {missingFields.length > 0 ? (
            <span className="candidate-edit-card__missing">
              חסר: {missingFields.join(' · ')}
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

      {expanded ? (
        <form className="party-edit-panel__form" onSubmit={handleSave}>
          <label className="candidate-edit-card__field">
            <span>שם מלא</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => updateField('name', event.target.value)}
              required
            />
          </label>

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
            <div className="party-edit-panel__color-row">
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : '#4890fd'
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

          <label className="candidate-edit-card__field">
            <span>קישור לוגו</span>
            <input
              type="url"
              value={draft.logoUrl}
              onChange={(event) => updateField('logoUrl', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>אות על גלגלת</span>
            <input
              type="text"
              value={draft.ballotLetter}
              onChange={(event) => updateField('ballotLetter', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>תיאור</span>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => updateField('description', event.target.value)}
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
              {saveState.status === 'saving' ? 'שומר…' : 'שמור פרטי מפלגה'}
            </button>
            <button
              type="button"
              className="candidate-edit-card__collapse"
              onClick={() => setExpanded(false)}
            >
              סגור
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
