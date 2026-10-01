# Knesset Committees Page

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure and [Database.md](./Database.md) for the Committees group schema.

Visualization of **Knesset 25** committee sittings: pick a committee and session, see MKs around a hollow committee table, and play the transcript as a WhatsApp-style chat beside the table.

Route: `/knesset/committees`

Status: **frontend MVP live** (schema + ingest + page). Full membership roster around the table; when protocol attendance exists, absentees render gray. Keyword search not built yet.

## Page structure

```
┌──────────────────────────────────────────────────────────────┐
│  Header: title + link back to /knesset                       │
│  Pickers: ועדה · ישיבה · toggle “רק ישיבות עם תמליל”        │
├────────────────────────────┬─────────────────────────────────┤
│  CommitteeTable            │  CommitteeTranscriptChat        │
│  (hollow racetrack + MKs)  │  (WhatsApp-style messages)      │
│                            │  blue header · chat · footer   │
│                            │  (Prev / Play / Next)          │
└────────────────────────────┴─────────────────────────────────┘
Desktop: table left, chat right. Mobile: table on top (capped height),
chat below (~48vh) so both stay in view.
```

## Files

| File | Role |
|------|------|
| `src/app/knesset/committees/page.tsx` | Metadata + view |
| `src/views/KnessetCommitteesPage.tsx` | Shell, pickers, Play state, MK selection |
| `src/views/KnessetCommitteesPage.css` | Page + table + chat styles |
| `src/components/knesset/CommitteeTable.tsx` | SVG table + seats |
| `src/components/knesset/CommitteeTranscriptChat.tsx` | Full transcript as chat messages + play controls |
| `src/lib/committeeTypes.ts` | Shared TS types |
| `src/lib/committeeTableLayout.ts` | Seat placement around the table |
| `src/lib/committeeSpeakerMatch.ts` | Match parts → seated MKs by person_id / header |
| `src/hooks/useKnessetCommittees.ts` | K25 committees that have at least one ready transcript |
| `src/hooks/useCommitteeSessions.ts` | Sessions (+ transcript filter) |
| `src/hooks/useCommitteeMemberships.ts` | Active members for session date |
| `src/hooks/useCommitteeAttendance.ts` | Session attendees from `נכחו` parse |
| `src/hooks/usePersonFactions.ts` | Person → faction name as of session date |
| `src/hooks/useCommitteeTranscript.ts` | Transcript + ordered parts |

Link into the page from `/knesset` (“ועדות הכנסת”). Sitemap includes `/knesset/committees`.

## Behavior

### Pickers
- Committees: Knesset **25** only, and **only committees with at least one ready transcript**; sorted current-first, then ראשית, then Hebrew name.
- Sessions: newest `start_at` first. **Default filter:** only sessions with `knesset_committee_session_transcripts.parse_status = 'ready'`. Toggle off → “כל הישיבות” (Play empty state if no parts).
- Auto-select first committee and its newest matching session.

### Table
- Vertical (portrait) **hollow racetrack** — thick polished dark-brown wood ring with straighter long sides and rounded ends (less elliptical), open center.
- **Chair** at the head (top); **יועמ״ש** placeholder beside them on the MK orbit (no photo, not clickable).
- **Full membership roster** around the table. When `knesset_committee_session_attendance` has rows for the session (parsed from protocol `נכחו` + `חברי הכנסת`), members not listed as present keep their seat with a **gray photo**; **guest MKs** listed under `חברי הכנסת` who are not committee members are still added in color. Without attendance data, everyone renders normally.
- Remaining members distributed around the oval rim (cap ~22; overflow note). Present members are placed before absentees within the same role.
- Click MK → selects them (blue ring), highlights their chat messages, jumps chat to their first message. Click again clears selection.

### Transcript chat
- All session parts listed top→bottom as WhatsApp-like bubbles. Preamble / attendance / staff blocks use WhatsApp **protocol notice** cards: centered pale-yellow (`#fff3c5`) rounded rectangles with small centered grey text.
- **Play** advances `activeOrdinal` every **3s**, scrolls the active bubble into view, highlights the speaking seat; pauses at end.
- Controls sit in the chat **footer** (prev / play / next + progress). Header uses site blue (`--color-blue`) with white title = **committee name**, subtitle = **ישיבה N · weekday, date, time**; message progress stays on the side.
- Active bubble gets a blue ring; clicking any bubble jumps Play to that ordinal.
- Each MK bubble shows **name + faction/party** (from `knesset_memberships` → `knesset_factions`, short_name preferred).
- With an MK selected: their bubbles stay emphasized, others dim; **להודעה הבאה שלו/ה** jumps to the next message by that MK (wraps to first).

## Data queries

1. Resolve `knessets.id` where `knesset_number = 25` → `knesset_committees`, then keep only committees that appear on a ready `knesset_committee_session_transcripts` row (via session).
2. Sessions for `committee_id`; mark `hasTranscript` via ready transcripts for those session ids (chunked `.in`).
3. Memberships for committee, filtered to session date; join `people`.
4. Attendance for `session_id` (when present, absentees are grayed; guests may be added).
5. Transcript by `session_id` + parts ordered by `ordinal`, join `people`.

## Ingest

**Script:** `Layer 1 - Gathering Data/knesset/load_knesset_committees.py`  
**Schema:** `Layer 1 - Gathering Data/knesset/schema_knesset_committees.sql`  
Weekly via `.github/workflows/knesset-pipeline.yml` (200 newest missing transcripts/run).

Attendance is extracted from transcript parts with headers `נכחו` (committee members) and `חברי הכנסת` (guest MKs who are not committee members) whenever transcripts are synced, and can be backfilled with:

```bash
python load_knesset_committees.py --table attendance
```

The UI merges those attendance rows onto the table even when the person is not in `knesset_committee_memberships`.

## Out of scope (later)

- Keyword search (FTS on parts already indexed)
- Timed audio sync (`start_offset_ms`)
- Legal-counsel as a real person row
- Progressive “send” animation that hides future messages until Play reaches them
