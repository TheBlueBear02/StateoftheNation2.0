import { useEffect, useMemo, useState } from 'react'
import { SiteLayout } from '../components/SiteLayout'
import { KnessetHemicycle } from '../components/knesset/KnessetHemicycle'
import { FactionList } from '../components/knesset/FactionList'
import { MEMBER_SORT_OPTIONS, type MemberSortMode } from '../lib/memberSort'
import { useKnessetMembers } from '../hooks/useKnessetMembers'
import {
  formatKnessetLabel,
  formatKnessetMembersTitle,
  formatKnessetTitle,
  useKnessetList,
} from '../hooks/useKnessetList'
import type { KnessetOption } from '../lib/supabase'
import './KnessetPage.css'

export function KnessetPage() {
  const { knessets, loading: listLoading } = useKnessetList()
  const [selectedKnesset, setSelectedKnesset] = useState<KnessetOption | null>(
    null,
  )
  const [sortMode, setSortMode] = useState<MemberSortMode>('parties')

  useEffect(() => {
    if (selectedKnesset || knessets.length === 0) {
      return
    }

    const defaultTerm =
      knessets.find((term) => term.isActive) ?? knessets[0] ?? null
    setSelectedKnesset(defaultTerm)
  }, [knessets, selectedKnesset])

  const {
    members,
    placedMembers,
    factionGroups,
    coalitionCount,
    oppositionCount,
    hasCoalitionData,
    loading,
    error,
  } = useKnessetMembers(selectedKnesset)

  const sortOptions = useMemo(
    () =>
      hasCoalitionData
        ? MEMBER_SORT_OPTIONS
        : MEMBER_SORT_OPTIONS.filter((option) => option.value !== 'bloc'),
    [hasCoalitionData],
  )

  useEffect(() => {
    if (!hasCoalitionData && sortMode === 'bloc') {
      setSortMode('parties')
    }
  }, [hasCoalitionData, sortMode])

  const pageLoading = listLoading || loading
  const title = selectedKnesset
    ? formatKnessetTitle(selectedKnesset)
    : 'הכנסת'
  const membersTitle = selectedKnesset
    ? formatKnessetMembersTitle(selectedKnesset)
    : 'חברי הכנסת'

  return (
    <SiteLayout className="knesset-page">
      <main className="knesset-page__main">
        <section className="knesset-page__section" aria-labelledby="knesset-title">
          <div className="knesset-page__inner container">
            <header className="knesset-page__header">
              <div className="knesset-page__header-row">
                <h1 id="knesset-title" className="knesset-page__title">
                  {title}
                </h1>

                <label className="knesset-page__picker">
                  <select
                    className="knesset-page__picker-select"
                    value={selectedKnesset?.id ?? ''}
                    onChange={(event) => {
                      const nextTerm = knessets.find(
                        (term) => term.id === Number(event.target.value),
                      )
                      setSelectedKnesset(nextTerm ?? null)
                    }}
                    disabled={listLoading || knessets.length === 0}
                    aria-label="בחירת כנסת"
                  >
                    {knessets.map((term) => (
                      <option key={term.id} value={term.id}>
                        {formatKnessetLabel(term)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </header>

            <KnessetHemicycle
              key={selectedKnesset?.id ?? 'loading'}
              placedMembers={placedMembers}
              coalitionCount={coalitionCount}
              oppositionCount={oppositionCount}
              hasCoalitionData={hasCoalitionData}
              loading={pageLoading}
            />

            <div className="knesset-page__below container">
              {error ? (
                <p className="knesset-page__error" role="alert">
                  לא ניתן לטעון את נתוני הכנסת
                </p>
              ) : null}

              {!error ? (
                <section
                  className="knesset-page__factions"
                  aria-label={membersTitle}
                >
                  <div className="knesset-page__factions-header">
                    <h2 className="knesset-page__factions-title">{membersTitle}</h2>

                    <label className="knesset-page__sort">
                      <span className="knesset-page__sort-label">מיון:</span>
                      <select
                        className="knesset-page__sort-select"
                        value={sortMode}
                        onChange={(event) =>
                          setSortMode(event.target.value as MemberSortMode)
                        }
                        aria-label="מיון רשימת חברי הכנסת"
                      >
                        {sortOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <FactionList
                    key={selectedKnesset?.id ?? 'none'}
                    factionGroups={factionGroups}
                    members={members}
                    sortMode={sortMode}
                    loading={pageLoading}
                  />
                </section>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </SiteLayout>
  )
}
