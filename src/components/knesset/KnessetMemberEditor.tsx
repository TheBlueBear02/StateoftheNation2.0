'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  formatKnessetLabel,
  useKnessetList,
} from '../../hooks/useKnessetList'
import {
  useKnessetMembershipEdits,
  type MembershipEdit,
} from '../../hooks/useKnessetMembershipEdits'
import { useKnessetFactions } from '../../hooks/useKnessetFactions'
import type { KnessetOption } from '../../lib/supabase'
import { MEMBER_EDIT_MIGRATION } from '../../lib/knessetMemberEdit'
import {
  updateKnessetMember,
  uploadKnessetMemberImage,
} from '../../lib/updateKnessetMember'

type MemberDraft = {
  fullName: string
  gender: string
  birthDate: string
  email: string
  imageUrl: string
  twitterHandle: string
  wikipediaUrl: string
  factionId: string
}

type SaveState = {
  status: 'idle' | 'saving' | 'success' | 'error'
  message: string | null
}

function memberToDraft(member: MembershipEdit): MemberDraft {
  return {
    fullName: member.fullName,
    gender: member.gender ?? '',
    birthDate: member.birthDate ?? '',
    email: member.email ?? '',
    imageUrl: member.imageUrl ?? '',
    twitterHandle: member.twitterHandle ?? '',
    wikipediaUrl: member.wikipediaUrl ?? '',
    factionId: member.factionId == null ? '' : String(member.factionId),
  }
}

function draftsEqual(a: MemberDraft, b: MemberDraft): boolean {
  return (
    a.fullName === b.fullName &&
    a.gender === b.gender &&
    a.birthDate === b.birthDate &&
    a.email === b.email &&
    a.imageUrl === b.imageUrl &&
    a.twitterHandle === b.twitterHandle &&
    a.wikipediaUrl === b.wikipediaUrl &&
    a.factionId === b.factionId
  )
}

function EditableMemberCard({
  member,
  factions,
  onSaved,
}: {
  member: MembershipEdit
  factions: { id: number; label: string }[]
  onSaved: () => Promise<void>
}) {
  const baseline = useMemo(() => memberToDraft(member), [member])
  const [draft, setDraft] = useState<MemberDraft>(baseline)
  const [expanded, setExpanded] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({
    status: 'idle',
    message: null,
  })

  useEffect(() => {
    setDraft(baseline)
    setPhotoFile(null)
    setSaveState({ status: 'idle', message: null })
  }, [baseline])

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null)
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  const factionChoices = useMemo(() => {
    if (
      member.factionId != null &&
      !factions.some((faction) => faction.id === member.factionId)
    ) {
      return [
        {
          id: member.factionId,
          label: member.factionName || `סיעה ${member.factionId}`,
        },
        ...factions,
      ]
    }
    return factions
  }, [factions, member.factionId, member.factionName])

  const dirty = !draftsEqual(draft, baseline) || photoFile != null
  const photoSrc = photoPreview || draft.imageUrl || null

  function updateField<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) {
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

    let imageUrl = draft.imageUrl.trim() || null
    if (photoFile) {
      const uploaded = await uploadKnessetMemberImage(member.personId, photoFile)
      if (!uploaded.ok) {
        setSaveState({ status: 'error', message: uploaded.error })
        return
      }
      imageUrl = uploaded.imageUrl ?? imageUrl
    }

    const result = await updateKnessetMember({
      membershipId: member.membershipId,
      personId: member.personId,
      knessetId: member.knessetId,
      fullName: draft.fullName.trim(),
      gender: draft.gender.trim() || null,
      birthDate: draft.birthDate.trim() || null,
      email: draft.email.trim() || null,
      imageUrl,
      twitterHandle: draft.twitterHandle.trim() || null,
      wikipediaUrl: draft.wikipediaUrl.trim() || null,
      factionId: draft.factionId ? Number(draft.factionId) : null,
    })

    if (!result.ok) {
      setSaveState({ status: 'error', message: result.error })
      return
    }

    setPhotoFile(null)
    setSaveState({ status: 'success', message: 'נשמר בהצלחה' })
    await onSaved()
  }

  const factionLabel =
    member.factionName ?? (member.factionId == null ? 'ללא סיעה' : 'סיעה')

  return (
    <li
      className={`candidate-card candidate-edit-card mk-edit-card${expanded ? ' candidate-edit-card--expanded' : ''}`}
    >
      <div className="candidate-edit-card__summary-row">
        <button
          type="button"
          className="candidate-edit-card__summary"
          onClick={() => setExpanded((current) => !current)}
        >
          {photoSrc ? (
            <img className="mk-edit-card__photo" src={photoSrc} alt="" />
          ) : (
            <span className="mk-edit-card__photo mk-edit-card__photo--empty" aria-hidden>
              {member.fullName.slice(0, 1)}
            </span>
          )}
          <span className="candidate-edit-card__summary-body">
            <span className="candidate-card__name">{member.fullName}</span>
            <span className="faction-edit-card__full-name">{factionLabel}</span>
            {member.factionId == null ? (
              <span className="faction-edit-card__badge mk-edit-card__badge--missing">
                ללא סיעה
              </span>
            ) : null}
            {member.factionProvisional ? (
              <span className="faction-edit-card__badge">זמני</span>
            ) : null}
            {member.factionManual ? (
              <span className="faction-edit-card__badge">ידני</span>
            ) : null}
            {member.endDate ? (
              <span className="faction-edit-card__badge">הסתיימה</span>
            ) : null}
          </span>
        </button>
      </div>

      {expanded ? (
        <form className="candidate-edit-card__form" onSubmit={(event) => void handleSave(event)}>
          <label className="candidate-edit-card__field">
            <span>שם מלא</span>
            <input
              value={draft.fullName}
              onChange={(event) => updateField('fullName', event.target.value)}
              required
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>מגדר</span>
            <select
              value={draft.gender}
              onChange={(event) => updateField('gender', event.target.value)}
            >
              <option value="">לא צוין</option>
              <option value="זכר">זכר</option>
              <option value="נקבה">נקבה</option>
              {draft.gender && draft.gender !== 'זכר' && draft.gender !== 'נקבה' ? (
                <option value={draft.gender}>{draft.gender}</option>
              ) : null}
            </select>
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
            <span>אימייל</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => updateField('email', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>טוויטר</span>
            <input
              value={draft.twitterHandle}
              onChange={(event) => updateField('twitterHandle', event.target.value)}
              placeholder="@handle"
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>ויקיפדיה</span>
            <input
              type="url"
              value={draft.wikipediaUrl}
              onChange={(event) => updateField('wikipediaUrl', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>קישור תמונה</span>
            <input
              type="url"
              value={draft.imageUrl}
              onChange={(event) => updateField('imageUrl', event.target.value)}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>העלאת תמונה</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                setPhotoFile(event.target.files?.[0] ?? null)
                if (saveState.status !== 'idle') {
                  setSaveState({ status: 'idle', message: null })
                }
              }}
            />
          </label>

          <label className="candidate-edit-card__field">
            <span>סיעה</span>
            <select
              value={draft.factionId}
              onChange={(event) => updateField('factionId', event.target.value)}
            >
              <option value="">ללא סיעה</option>
              {factionChoices.map((faction) => (
                <option key={faction.id} value={faction.id}>
                  {faction.label}
                </option>
              ))}
            </select>
          </label>

          <p className="mk-edit-card__hint">
            סיעה שנבחרת כאן נשמרת עד שהכנסת מפרסמת FactionID רשמי. הסנכרון לא
            יחליף אותה בקישור זמני מרשימת הבחירות.
          </p>

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

export function KnessetMemberEditor() {
  const { knessets, loading: listLoading } = useKnessetList()
  const [selectedKnesset, setSelectedKnesset] = useState<KnessetOption | null>(null)
  const [query, setQuery] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)

  useEffect(() => {
    if (selectedKnesset || knessets.length === 0) {
      return
    }
    setSelectedKnesset(
      knessets.find((term) => term.isActive) ?? knessets[0] ?? null,
    )
  }, [knessets, selectedKnesset])

  const { factions } = useKnessetFactions(selectedKnesset?.id ?? null)
  const { members, loading, error, schemaReady, refetch } =
    useKnessetMembershipEdits(selectedKnesset?.id ?? null)

  const factionOptions = useMemo(
    () =>
      factions.map((faction) => ({
        id: faction.id,
        label: faction.shortName || faction.name || `סיעה ${faction.id}`,
      })),
    [factions],
  )

  const missingCount = members.filter((member) => member.factionId == null).length
  const visible = useMemo(() => {
    const needle = query.trim()
    return members.filter((member) => {
      if (missingOnly && member.factionId != null) {
        return false
      }
      if (needle && !member.fullName.includes(needle)) {
        return false
      }
      return true
    })
  }, [members, missingOnly, query])

  return (
    <section className="party-detail-card" aria-labelledby="knesset-members-title">
      <div className="party-detail-card__header">
        <p className="party-detail-card__eyebrow">חברי כנסת</p>
        <h2 id="knesset-members-title" className="party-detail-card__title">
          עריכת חברי כנסת
        </h2>
        <p className="mk-edit-card__hint">
          שם, תמונה, פרטים אישיים וסיעה. תמונה שהועלתה נשמרת ב-Supabase Storage
          ומוצגת באתר דרך שדה image_url הקיים.
        </p>
      </div>

      <label className="election-edit-page__picker">
        <span className="visually-hidden">כנסת</span>
        <select
          className="election-edit-page__picker-select"
          value={selectedKnesset?.id ?? ''}
          disabled={listLoading || knessets.length === 0}
          onChange={(event) => {
            const next = Number(event.target.value)
            setSelectedKnesset(knessets.find((term) => term.id === next) ?? null)
            setQuery('')
          }}
        >
          {knessets.map((term) => (
            <option key={term.id} value={term.id}>
              {formatKnessetLabel(term)}
            </option>
          ))}
        </select>
      </label>

      <div className="mk-edit-toolbar">
        <label className="candidate-edit-card__field mk-edit-toolbar__search">
          <span className="visually-hidden">חיפוש לפי שם</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש לפי שם"
          />
        </label>
        <button
          type="button"
          className={`candidate-edit-card__collapse${missingOnly ? ' mk-edit-toolbar__filter--on' : ''}`}
          aria-pressed={missingOnly}
          onClick={() => setMissingOnly((current) => !current)}
        >
          ללא סיעה ({missingCount})
        </button>
      </div>

      {!schemaReady ? (
        <p className="knesset-status-panel__alert" role="status">
          {MEMBER_EDIT_MIGRATION}
        </p>
      ) : null}

      {loading ? <p className="election-edit-page__muted">טוען חברי כנסת…</p> : null}

      {error ? (
        <p className="candidate-edit-card__status candidate-edit-card__status--error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && members.length > 0 ? (
        <p className="election-edit-page__muted">
          {visible.length} מתוך {members.length}
          {missingCount > 0 ? ` · ${missingCount} ללא סיעה` : ''}
        </p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <p className="election-edit-page__muted">לא נמצאו חברי כנסת תואמים.</p>
      ) : null}

      <ul className="candidate-list">
        {visible.map((member) => (
          <EditableMemberCard
            key={member.membershipId}
            member={member}
            factions={factionOptions}
            onSaved={refetch}
          />
        ))}
      </ul>
    </section>
  )
}
