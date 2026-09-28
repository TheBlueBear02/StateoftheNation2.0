'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  LaidOutEvent,
  TimelineData,
  TimelineEra,
} from '@/content/timeline/types'
import {
  EventEditForm,
  createEmptyDraft,
  draftFromLaid,
  type EventEditDraft,
} from '@/components/timeline/EventEditForm'
import { PortraitColumn } from '@/components/timeline/PortraitColumn'
import { TimelineCanvas } from '@/components/timeline/TimelineCanvas'
import { YearAxis } from '@/components/timeline/YearAxis'
import { ZoomControls } from '@/components/timeline/ZoomControls'
import { useTimelineViewport } from '@/hooks/useTimelineViewport'
import { eventYearRange } from '@/lib/timeline/dates'
import {
  buildRows,
  computeDataRange,
  entitiesInViewport,
  layoutEvents,
  orderRows,
} from '@/lib/timeline/layout'
import {
  deleteEventFromData,
  saveTimelineEventApi,
  upsertEventInData,
} from '@/lib/timeline/mutateData'
import {
  clearDraftFor,
  draftStorageKeyForEvent,
  draftStorageKeyForNew,
  loadEventDraft,
  loadLastSelectedPersonIds,
  saveEventDraft,
  saveLastSelectedPersonIds,
} from '@/lib/timeline/draftStorage'
import './TimelinePage.css'

interface TimelineEditPageProps {
  initialData: TimelineData
}

export function TimelineEditPage({ initialData }: TimelineEditPageProps) {
  const router = useRouter()
  const [data, setData] = useState<TimelineData>(initialData)
  const [draft, setDraft] = useState<EventEditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(initialData)
  }, [initialData])

  const orderedPeople = useMemo(
    () => orderRows(data.people, data.sharedEvents),
    [data.people, data.sharedEvents],
  )

  const [visiblePersonIds, setVisiblePersonIds] = useState(
    () => new Set(initialData.people.map((p) => p.id)),
  )
  const [stateVisible, setStateVisible] = useState(true)

  const trackRef = useRef<HTMLDivElement>(null)
  const [trackSize, setTrackSize] = useState({ width: 800, height: 500 })

  const { minYear, maxYear } = useMemo(
    () =>
      computeDataRange(
        data.people,
        data.stateEvents,
        data.sharedEvents,
        data.eras,
      ),
    [data],
  )

  const viewport = useTimelineViewport(trackRef, minYear, maxYear)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setTrackSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const inView = useMemo(
    () =>
      entitiesInViewport(
        data.people,
        data.stateEvents,
        data.sharedEvents,
        viewport.viewStart,
        viewport.viewEnd,
      ),
    [
      data.people,
      data.stateEvents,
      data.sharedEvents,
      viewport.viewStart,
      viewport.viewEnd,
    ],
  )

  const filterRows = useMemo(() => {
    const rows = buildRows(orderedPeople, visiblePersonIds, stateVisible)
    return rows.filter((row) => {
      if (row.kind === 'state') return inView.stateInView
      return inView.personIds.has(row.id)
    })
  }, [orderedPeople, visiblePersonIds, stateVisible, inView])

  const { events, layerCount } = useMemo(() => {
    const span = viewport.viewEnd - viewport.viewStart
    const pixelsPerYear =
      span > 0 && trackSize.width > 0 ? trackSize.width / span : 1
    return layoutEvents(
      data.people,
      data.stateEvents,
      data.sharedEvents,
      visiblePersonIds,
      stateVisible,
      pixelsPerYear,
    )
  }, [
    data.people,
    data.stateEvents,
    data.sharedEvents,
    visiblePersonIds,
    stateVisible,
    viewport.viewStart,
    viewport.viewEnd,
    trackSize.width,
  ])

  const togglePerson = (id: string) => {
    setVisiblePersonIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        const othersInViewOn = [...inView.personIds].some(
          (pid) => pid !== id && next.has(pid),
        )
        const stateStillOn = stateVisible && inView.stateInView
        if (!othersInViewOn && !stateStillOn) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleState = () => {
    setStateVisible((prev) => {
      if (prev) {
        const anyPersonInViewOn = [...inView.personIds].some((pid) =>
          visiblePersonIds.has(pid),
        )
        if (!anyPersonInViewOn) return prev
      }
      return !prev
    })
  }

  const focusEra = (era: TimelineEra) => {
    const { startYear, endYear } = eventYearRange(era.startDate, era.endDate)
    viewport.zoomToRange(startYear, endYear)
  }

  const openAdd = () => {
    setError(null)
    const saved = loadEventDraft(draftStorageKeyForNew())
    if (saved) {
      setDraft(saved)
      return
    }
    const lastPeople = loadLastSelectedPersonIds()
    const known = new Set(data.people.map((p) => p.id))
    const personIds =
      lastPeople?.filter((id) => known.has(id)) ??
      (data.people[0]?.id ? [data.people[0].id] : [])
    setDraft(createEmptyDraft(personIds))
  }

  const openEdit = (laid: LaidOutEvent) => {
    setError(null)
    const saved = loadEventDraft(draftStorageKeyForEvent(laid.event.id))
    setDraft(saved ?? draftFromLaid(laid))
  }

  const updateDraft = (
    next: EventEditDraft | ((prev: EventEditDraft) => EventEditDraft),
  ) => {
    setDraft((current) => {
      if (!current) return current
      const resolved = typeof next === 'function' ? next(current) : next
      saveEventDraft(resolved)
      return resolved
    })
  }

  const closeForm = () => {
    if (saving) return
    if (draft) saveEventDraft(draft)
    setDraft(null)
    setError(null)
  }

  const handleSave = async () => {
    if (!draft) return
    if (!draft.event.title.trim() || !draft.event.description.trim()) {
      setError('יש למלא כותרת ותיאור')
      return
    }
    if (!draft.event.startDate.trim()) {
      setError('יש למלא תאריך התחלה בפורמט 24.10.2026')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveTimelineEventApi({
        action: 'upsert',
        event: draft.event,
        personIds: draft.personIds,
        previousPersonIds: draft.previousPersonIds,
      })
      clearDraftFor(draft)
      saveLastSelectedPersonIds(draft.personIds)
      setData((current) =>
        upsertEventInData(current, draft.event, draft.personIds),
      )
      setDraft(null)
      // Reload from disk so the page matches written JSON (avoid stale static imports).
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!draft || draft.isNew) return
    if (!window.confirm('למחוק את האירוע?')) return
    setSaving(true)
    setError(null)
    try {
      await saveTimelineEventApi({
        action: 'delete',
        event: draft.event,
        personIds: draft.personIds,
        previousPersonIds: draft.previousPersonIds,
      })
      clearDraftFor(draft)
      setData((current) => deleteEventFromData(current, draft.event.id))
      setDraft(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה במחיקה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="timeline-page timeline-page--edit">
      <header className="timeline-chrome" data-timeline-no-pan dir="ltr">
        <div className="timeline-chrome__edit-start">
          <ZoomControls
            onZoomIn={viewport.zoomIn}
            onZoomOut={viewport.zoomOut}
            onShowAll={viewport.showAll}
            isFitted={viewport.isFitted}
          />
          <button
            type="button"
            className="timeline-chrome__add-event"
            onClick={openAdd}
          >
            הוסף אירוע
          </button>
        </div>
        <div className="timeline-chrome__branding">
          <h1 className="timeline-chrome__title">
            עריכת ציר זמן | בזכותם
          </h1>
          <p className="timeline-chrome__subtitle">
            לחצו על אירוע לעריכה · שינויים נשמרים לקבצי ה-JSON
          </p>
        </div>
        <div className="timeline-chrome__edit-end">
          <Link href="/timeline" className="timeline-chrome__view-link">
            לתצוגה
          </Link>
          <Link href="/" className="timeline-chrome__home" aria-label="מצב האומה - דף הבית">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/header-logo%203.svg"
              alt="מצב האומה"
              className="timeline-chrome__logo"
              width={140}
              height={36}
            />
          </Link>
        </div>
      </header>

      <div className="timeline-body" dir="ltr">
        <PortraitColumn
          rows={filterRows}
          onTogglePerson={togglePerson}
          onToggleState={toggleState}
        />

        <div className="timeline-main">
          <div
            className="timeline-track"
            ref={trackRef}
            role="region"
            aria-label="ציר הזמן לעריכה"
          >
            <TimelineCanvas
              eras={data.eras}
              events={events}
              layerCount={layerCount}
              viewStart={viewport.viewStart}
              viewEnd={viewport.viewEnd}
              width={trackSize.width}
              height={trackSize.height}
              onSelectEvent={openEdit}
              onSelectEra={focusEra}
            />
          </div>
          <YearAxis
            viewStart={viewport.viewStart}
            viewEnd={viewport.viewEnd}
            width={trackSize.width}
          />
        </div>
      </div>

      {draft ? (
        <EventEditForm
          key={`${draft.isNew ? 'new' : 'edit'}-${draft.event.id}`}
          draft={draft}
          people={data.people}
          saving={saving}
          error={error}
          onChange={updateDraft}
          onSave={handleSave}
          onDelete={draft.isNew ? undefined : handleDelete}
          onClose={closeForm}
        />
      ) : null}
    </div>
  )
}
