import { useMemo, useState, type MouseEvent } from 'react'
import type { FactionGroup } from '../../lib/hemicycle'
import { getInitials, resolveFactionColor, tintColor } from '../../lib/hemicycle'
import type { KnessetMember } from '../../hooks/useKnessetMembers'
import type { MemberSortMode } from '../../lib/memberSort'
import { formatTenureDays, formatTenureYears } from '../../lib/knessetTenure'
import { Tooltip } from './Tooltip'

type FactionListProps = {
  factionGroups: FactionGroup[]
  members: KnessetMember[]
  sortMode: MemberSortMode
  loading?: boolean
}

type HoveredMember = {
  fullName: string
  factionName: string | null
  factionColor: string | null
  imageUrl: string | null
  firstElectedYear: number | null
  totalDaysInKnesset: number
  totalYearsInKnesset: number
  additionalRoles: string[]
}

type BlocGroup = {
  id: 'coalition' | 'opposition'
  label: string
  members: KnessetMember[]
}

function seatsLabel(count: number): string {
  return count === 1 ? 'מנדט אחד' : `${count} מנדטים`
}

function compareByName(left: KnessetMember, right: KnessetMember): number {
  return left.fullName.localeCompare(right.fullName, 'he')
}

function compareByTenure(left: KnessetMember, right: KnessetMember): number {
  if (left.totalDaysInKnesset !== right.totalDaysInKnesset) {
    return right.totalDaysInKnesset - left.totalDaysInKnesset
  }

  return compareByName(left, right)
}

function compareByFirstElected(left: KnessetMember, right: KnessetMember): number {
  const leftYear = left.firstElectedYear
  const rightYear = right.firstElectedYear

  if (leftYear === null && rightYear === null) {
    return compareByName(left, right)
  }

  if (leftYear === null) {
    return 1
  }

  if (rightYear === null) {
    return -1
  }

  if (leftYear !== rightYear) {
    return leftYear - rightYear
  }

  if (left.totalDaysInKnesset !== right.totalDaysInKnesset) {
    return right.totalDaysInKnesset - left.totalDaysInKnesset
  }

  return compareByName(left, right)
}

function sortMembers(members: KnessetMember[], sortMode: MemberSortMode): KnessetMember[] {
  const sorted = [...members]

  switch (sortMode) {
    case 'tenure':
      return sorted.sort(compareByTenure)
    case 'name':
      return sorted.sort(compareByName)
    case 'firstElected':
      return sorted.sort(compareByFirstElected)
    default:
      return sorted
  }
}

function buildBlocGroups(members: KnessetMember[]): BlocGroup[] {
  const coalition = members
    .filter((member) => member.isCoalition)
    .sort((left, right) => {
      const factionCompare = (left.factionName ?? '').localeCompare(
        right.factionName ?? '',
        'he',
      )

      if (factionCompare !== 0) {
        return factionCompare
      }

      return compareByName(left, right)
    })

  const opposition = members
    .filter((member) => !member.isCoalition)
    .sort((left, right) => {
      const factionCompare = (left.factionName ?? '').localeCompare(
        right.factionName ?? '',
        'he',
      )

      if (factionCompare !== 0) {
        return factionCompare
      }

      return compareByName(left, right)
    })

  const groups: BlocGroup[] = [
    { id: 'coalition', label: 'קואליציה', members: coalition },
    { id: 'opposition', label: 'אופוזיציה', members: opposition },
  ]

  return groups.filter((group) => group.members.length > 0)
}

function MemberAvatar({
  member,
  color,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: {
  member: KnessetMember
  color: string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onMouseMove: (event: MouseEvent) => void
}) {
  return (
    <li
      className="faction-member"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
    >
      {member.imageUrl ? (
        <img
          className="faction-member__photo"
          src={member.imageUrl}
          alt={member.fullName}
          loading="lazy"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className="faction-member__initials"
          style={{
            borderColor: color,
            backgroundColor: tintColor(color, 0.2),
          }}
        >
          {getInitials(member.fullName)}
        </span>
      )}
    </li>
  )
}

type MemberTableProps = {
  members: KnessetMember[]
  onHover: (member: KnessetMember) => void
  onLeave: () => void
  onMove: (event: MouseEvent) => void
}

function MemberTable({ members, onHover, onLeave, onMove }: MemberTableProps) {
  return (
    <div className="member-table-wrap">
      <table className="member-table">
        <thead>
          <tr>
            <th scope="col" className="member-table__col-photo">
              <span className="visually-hidden">תמונה</span>
            </th>
            <th scope="col" className="member-table__col-name">
              שם
            </th>
            <th scope="col" className="member-table__col-days">
              ימים בכנסת
            </th>
            <th scope="col" className="member-table__col-years">
              שנים בכנסת
            </th>
            <th scope="col" className="member-table__col-year">
              שנת בחירה ראשונה
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const color = resolveFactionColor(
              member.factionId,
              member.factionColor,
              member.factionName,
            )

            return (
              <tr
                key={member.id}
                className="member-table__row"
                onMouseEnter={() => onHover(member)}
                onMouseLeave={onLeave}
                onMouseMove={onMove}
              >
                <td className="member-table__cell member-table__cell--photo">
                  {member.imageUrl ? (
                    <img
                      className="member-table__photo"
                      src={member.imageUrl}
                      alt=""
                      loading="lazy"
                      style={{ borderColor: color }}
                    />
                  ) : (
                    <span
                      className="member-table__initials"
                      style={{
                        borderColor: color,
                        backgroundColor: tintColor(color, 0.2),
                      }}
                      aria-hidden="true"
                    >
                      {getInitials(member.fullName)}
                    </span>
                  )}
                </td>
                <td className="member-table__cell member-table__cell--name">
                  <span className="member-table__name">{member.fullName}</span>
                  {member.factionName ? (
                    <span className="member-table__faction">{member.factionName}</span>
                  ) : null}
                </td>
                <td className="member-table__cell member-table__cell--days">
                  {member.totalDaysInKnesset > 0
                    ? formatTenureDays(member.totalDaysInKnesset)
                    : '—'}
                </td>
                <td className="member-table__cell member-table__cell--years">
                  {member.totalYearsInKnesset > 0
                    ? formatTenureYears(member.totalYearsInKnesset)
                    : '—'}
                </td>
                <td className="member-table__cell member-table__cell--year">
                  {member.firstElectedYear ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function FactionList({
  factionGroups,
  members,
  sortMode,
  loading = false,
}: FactionListProps) {
  const [hovered, setHovered] = useState<HoveredMember | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  const sortedMembers = useMemo(
    () => sortMembers(members, sortMode),
    [members, sortMode],
  )

  const blocGroups = useMemo(
    () => (sortMode === 'bloc' ? buildBlocGroups(members) : []),
    [members, sortMode],
  )

  function handleMove(event: MouseEvent) {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  function hoverFromMember(member: KnessetMember) {
    setHovered({
      fullName: member.fullName,
      factionName: member.factionName,
      factionColor: member.factionColor,
      imageUrl: member.imageUrl,
      firstElectedYear: member.firstElectedYear,
      totalDaysInKnesset: member.totalDaysInKnesset,
      totalYearsInKnesset: member.totalYearsInKnesset,
      additionalRoles: member.additionalRoles,
    })
  }

  if (loading) {
    if (sortMode === 'tenure' || sortMode === 'firstElected') {
      return (
        <div className="member-table-wrap" aria-hidden="true">
          <div className="member-table member-table--skeleton" />
        </div>
      )
    }

    return (
      <div className="faction-list" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="faction-card faction-card--skeleton" />
        ))}
      </div>
    )
  }

  if (members.length === 0) {
    return null
  }

  function renderMemberList(memberList: KnessetMember[], keyPrefix: string) {
    return (
      <ul className="faction-card__members">
        {memberList.map((member) => {
          const color = resolveFactionColor(
            member.factionId,
            member.factionColor,
            member.factionName,
          )

          return (
            <MemberAvatar
              key={`${keyPrefix}-${member.id}`}
              member={member}
              color={color}
              onMouseEnter={() => hoverFromMember(member)}
              onMouseLeave={() => setHovered(null)}
              onMouseMove={handleMove}
            />
          )
        })}
      </ul>
    )
  }

  return (
    <>
      {sortMode === 'parties' ? (
        <div className="faction-list">
          {factionGroups.map((group) => {
            const color = resolveFactionColor(
              group.factionId,
              group.factionColor,
              group.factionName,
            )

            return (
              <article
                key={`${group.factionId ?? 'none'}-${group.factionName}`}
                className="faction-card"
              >
                <header className="faction-card__header">
                  <div className="faction-card__heading">
                    <h3 className="faction-card__name">{group.factionName}</h3>
                    <span className="faction-card__seats">
                      {seatsLabel(group.members.length)}
                    </span>
                  </div>
                  {group.factionLogoUrl ? (
                    <img
                      className="faction-card__logo"
                      src={group.factionLogoUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="faction-card__swatch"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                  )}
                </header>

                <ul className="faction-card__members">
                  {group.members.map((member, index) => (
                    <MemberAvatar
                      key={`${member.fullName}-${index}`}
                      member={{
                        id: index,
                        factionId: group.factionId,
                        fullName: member.fullName,
                        imageUrl: member.imageUrl,
                        factionName: group.factionName,
                        factionColor: group.factionColor,
                        factionLogoUrl: group.factionLogoUrl,
                        isCoalition: group.isCoalition,
                        knessetNumber: member.knessetNumber,
                        firstElectedYear: member.firstElectedYear,
                        totalDaysInKnesset: member.totalDaysInKnesset,
                        totalYearsInKnesset: member.totalYearsInKnesset,
                        additionalRoles: member.additionalRoles,
                      }}
                      color={color}
                      onMouseEnter={() =>
                        setHovered({
                          fullName: member.fullName,
                          factionName: group.factionName,
                          factionColor: group.factionColor,
                          imageUrl: member.imageUrl,
                          firstElectedYear: member.firstElectedYear,
                          totalDaysInKnesset: member.totalDaysInKnesset,
                          totalYearsInKnesset: member.totalYearsInKnesset,
                          additionalRoles: member.additionalRoles,
                        })
                      }
                      onMouseLeave={() => setHovered(null)}
                      onMouseMove={handleMove}
                    />
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      ) : null}

      {sortMode === 'bloc' ? (
        <div className="faction-list">
          {blocGroups.map((group) => (
            <article key={group.id} className="faction-card">
              <header className="faction-card__header">
                <h3 className="faction-card__name">{group.label}</h3>
                <span className="faction-card__seats">
                  {seatsLabel(group.members.length)}
                </span>
              </header>

              {renderMemberList(group.members, group.id)}
            </article>
          ))}
        </div>
      ) : null}

      {sortMode === 'tenure' || sortMode === 'firstElected' ? (
        <MemberTable
          members={sortedMembers}
          onHover={hoverFromMember}
          onLeave={() => setHovered(null)}
          onMove={handleMove}
        />
      ) : null}

      {sortMode === 'name' ? (
        <div className="member-list member-list--flat">
          {renderMemberList(sortedMembers, sortMode)}
        </div>
      ) : null}

      {hovered ? (
        <Tooltip
          fullName={hovered.fullName}
          factionName={hovered.factionName}
          factionColor={hovered.factionColor}
          imageUrl={hovered.imageUrl}
          firstElectedYear={hovered.firstElectedYear}
          totalDaysInKnesset={hovered.totalDaysInKnesset}
          totalYearsInKnesset={hovered.totalYearsInKnesset}
          additionalRoles={hovered.additionalRoles}
          x={tooltipPosition.x}
          y={tooltipPosition.y}
        />
      ) : null}
    </>
  )
}
