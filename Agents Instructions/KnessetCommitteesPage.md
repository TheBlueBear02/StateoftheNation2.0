# Knesset Committees Page

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure and [Database.md](./Database.md) for the Committees group schema.

Visualization of **Knesset 25** committee sittings: pick a committee and session from a WhatsApp-style group list, see MKs around a hollow committee table, and play the transcript as a chat beside the table.

Route: `/knesset/committees`

Status: **frontend MVP live** (schema + ingest + page). Full membership roster around the table; when protocol attendance exists, absentees render gray. Keyword search not built yet.

## Page structure

```
┌──────────────────────────────────────────────────────────────┐
│  Breadcrumb: הכנסת / ועדות הכנסת                             │
├────────────────────────────┬─────────────────────────────────┤
│  CommitteeTable            │  Chat panel (one of):           │
│  (always on desktop;       │  1) committee group list        │
│   empty until session)     │  2) session list (+ back)       │
│                            │  3) transcript chat (+ back)    │
└────────────────────────────┴─────────────────────────────────┘
Desktop: empty table left + chat/list right always; seats appear when a session is open.
Mobile: chat/list above the table; chat is full-bleed (no side padding) and takes most of the viewport height (~72dvh). Compact blue chat header (tighter padding, single-line title/subtitle with ellipsis). Table section is full width with auto height (hidden until a session is selected). Committee names wrap fully (last-session date moves under the title).
```

## Files

| File | Role |
|------|------|
| `src/app/knesset/committees/page.tsx` | Metadata + view |
| `src/views/KnessetCommitteesPage.tsx` | Shell, chat nav, Play state, MK selection |
| `src/views/KnessetCommitteesPage.css` | Page + table + chat + picker styles |
| `src/components/knesset/CommitteeTable.tsx` | SVG table + seats |
| `src/components/knesset/CommitteeChatPicker.tsx` | WhatsApp-style committee / session lists |
| `src/components/knesset/CommitteeTranscriptChat.tsx` | Full transcript as chat messages + play controls |
| `src/lib/committeeTypes.ts` | Shared TS types |
| `src/lib/committeeTableLayout.ts` | Seat placement around the table |
| `src/lib/committeeSpeakerMatch.ts` | Match parts → seated MKs by person_id / header |
| `src/hooks/useKnessetCommittees.ts` | K25 committees that have at least one ready transcript |
| `src/hooks/useCommitteeSessions.ts` | Sessions (+ transcript filter) |
| `src/hooks/useCommitteeMemberships.ts` | Active members for session date |
| `src/hooks/useCommitteeAttendance.ts` | Session attendees from `נכחו` parse |
| `src/hooks/usePersonFactions.ts` | Person → faction name as of session date |
| `src/hooks/usePersonTenures.ts` | Person → days/years in Knesset for seat tooltips |
| `src/hooks/useCommitteeTranscript.ts` | Transcript + ordered parts |
| `src/components/knesset/Tooltip.tsx` | Shared MK hover card (photo, name, party, tenure) |

Link into the page from `/knesset` (“ועדות הכנסת”). Sitemap includes `/knesset/committees`. No page H1/subtitle; top nav is `PageBreadcrumb` (`הכנסת` → `/knesset`, current `ועדות הכנסת`).

## Behavior

### Chat navigation (WhatsApp groups)
- **Committees list** (default): rows with avatar initials + committee name; only committees with a ready transcript. Sorted by **latest ready-transcript session** (newest first). Each row shows:
  - top-left: blue circle badge with ready-transcript **session count** (white number)
  - under title: **ישיבה אחרונה:** + date only
  - avatar: **chair photo** when available (else committee initials); no יו״ר name line
  - committee type (**ועדה ראשית** / **משנית**) sits beside the committee name
- Click committee → **sessions list** for that committee (ready transcripts only), with header **back** to committees.
  - Session row title = **סדר היום** when available (up to 2 lines, then ellipsis); otherwise **ישיבה N**. Datetime (**day · time · date**) under the title. Avatar still shows the session number.
- Click session → **transcript chat** + committee table; chat header has **back** to sessions.
- Chat header subtitle on desktop: **day · time · date · פרוטוקול ישיבה N** (RTL — datetime on the right). On mobile: **day · time · date** only.
- No top-of-page ועדה/ישיבה dropdowns.

### Table
- Always visible on desktop (empty wood ring when no session is selected, with hint above: בחרו ישיבת וועדה על מנת להראות את המשתתפים מסביב לשולחן). Table is vertically centered with the chat box; hint is absolutely positioned above it so selecting a session does not shift the table. On mobile, shown only while a session transcript is open.
- Vertical (portrait) **hollow racetrack** — thick polished dark-brown wood ring with straighter long sides and rounded ends (less elliptical), open center.
- **Chair** at the head (top); **יועמ״ש** placeholder beside them on the MK orbit (same seat size as members, no photo, not clickable).
- **Full membership roster** around the table. When `knesset_committee_session_attendance` has rows for the session (parsed from protocol `נכחו` + `חברי הכנסת`), members not listed as present keep their seat with a **gray photo**; **guest MKs** listed under `חברי הכנסת` who are not committee members are still added in color. Without attendance data, everyone renders normally.
- Remaining members distributed around the oval rim (cap ~22; overflow note). Present members are placed before absentees within the same role.
- Click MK → selects them (blue-dark ring), highlights their chat messages, jumps chat to their first message. Click again clears selection.
- Hover MK seat → scales up slightly with a blue ring glow; tooltip shows photo, name, party, committee role (if any), and Knesset tenure (days/years + first elected year when known).
- Speaker attribution only uses `person_id` when that person is on the session roster (membership + attendance guests). Global ingest matches for people who were not at the sitting are ignored; the chat falls back to the protocol `speaker_header` text.
- Consecutive Hasadna parts whose `speaker_header` is not a credible speaker turn (sentence fragments like "ואני אומר לבנימין נתניהו", tiny OCR stubs) are **merged** into the previous speech bubble so one oration stays one message.
- During **Play**, the currently speaking MK’s seat gets a **blue** ring.

### Transcript chat
- All session parts listed top→bottom as WhatsApp-like bubbles. Preamble / attendance / staff blocks use WhatsApp **protocol notice** cards: centered pale-yellow rounded rectangles with lower opacity.
- **Play** keeps yellow protocol/meta cards visible from the start, then **pops** real speech messages from the first MK part onward every **3s**. **Pause** then **Play** resumes from the same message; restart from the first speech only after the run finishes.
- Controls sit in the chat **footer** (prev / play / next + progress). Header uses site blue with **back**, title = committee name, subtitle = **day · time · date · פרוטוקול ישיבה N** (mobile: datetime only).
- The leading untitled protocol preamble card is omitted from the chat.
- Active bubble gets a blue ring; clicking any bubble jumps Play to that ordinal.
- Each MK bubble shows **name + faction/party** on one row.
- With an MK selected: their bubbles stay emphasized, others dim; **להודעה הבאה שלו/ה** jumps to the next message by that MK (wraps to first).

## Data queries

1. Resolve `knessets.id` where `knesset_number = 25` → `knesset_committees`, then keep only committees that appear on a ready `knesset_committee_session_transcripts` row (via session). Aggregate per committee: ready-session **count** + **latest `start_at`**, and load current **chair** (name + photo) from memberships (`seat_role = chair`). Sort committees by latest session descending.
2. Sessions for `committee_id`; mark `hasTranscript` via ready transcripts for those session ids (chunked `.in`). Fetch first `סדר היום` part body per session for the sessions list subtitle.
3. Memberships for committee, filtered to session date; join `people`. Enrich with factions (`usePersonFactions`) and tenure (`usePersonTenures` from `knesset_memberships`).
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
