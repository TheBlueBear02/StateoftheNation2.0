# Knesset Committees Page

> See [ProjectOverview.md](./ProjectOverview.md) for repo structure and [Database.md](./Database.md) for the Committees group schema.

Visualization of **Knesset 25** committee sittings: pick a committee and session from a WhatsApp-style group list, see MKs around a hollow committee table, and play the transcript as a chat beside the table.

Route: `/knesset/committees`  
Shareable deep links: `/knesset/committees?committee=<id>` (sessions list) and `/knesset/committees?committee=<id>&session=<id>` (transcript + table). Ids are the internal Supabase PKs (`knesset_committees.id`, `knesset_committee_sessions.id`). Browser back/forward follows the query.

Status: **frontend MVP live** (schema + ingest + page). Full membership roster around the table; when protocol attendance exists, absentees render gray. Keyword search not built yet.

## Page structure

```
┌──────────────────────────────────────────────────────────────┐
│  Breadcrumb: הכנסת / ועדות הכנסת  (desktop only)             │
├────────────────────────────┬─────────────────────────────────┤
│  CommitteeTable            │  Chat panel (one of):           │
│  (always on desktop;       │  1) committee group list        │
│   empty until session)     │  2) session list (+ back)       │
│                            │  3) transcript chat (+ back)    │
└────────────────────────────┴─────────────────────────────────┘
Desktop: breadcrumb + empty table left + chat/list right always; seats appear when a session is open.
Mobile: no breadcrumb; chat/list flush under the site header (no top padding/gap), above the table; chat is full-bleed (no side padding) and `70dvh` tall. Compact blue chat header (tighter padding, single-line title/subtitle with ellipsis). Table section is full width with auto height (hidden until a session is selected; scroll below chat when open). Committee names wrap fully (last-session date moves under the title).
```

## Files

| File | Role |
|------|------|
| `src/app/knesset/committees/page.tsx` | Metadata + view (OG/Twitter share image: `public/images/Knesset Committees/knesset-commiettees-thumbnail.png`) |
| `public/images/Knesset Committees/knesset-commiettees-thumbnail.png` | Link-preview thumbnail for `/knesset/committees` |
| `src/views/KnessetCommitteesPage.tsx` | Shell, chat nav, Play state, MK selection |
| `src/views/KnessetCommitteesPage.css` | Page + table + chat + picker styles |
| `src/components/knesset/CommitteeTable.tsx` | SVG table + seats |
| `src/components/knesset/CommitteeChatPicker.tsx` | WhatsApp-style committee / session lists |
| `src/components/knesset/CommitteeTranscriptChat.tsx` | Full transcript as chat messages + play controls + AI summary |
| `src/app/api/knesset/committee-session-summary/route.ts` | OpenAI short session summary (agenda + discussion + votes) |
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

Link into the page from `/knesset` (“ועדות הכנסת”). Sitemap includes `/knesset/committees`. Share previews (Open Graph / Twitter) use `knesset-commiettees-thumbnail.png` (1060×739). No page H1/subtitle; desktop top nav is `PageBreadcrumb` (`הכנסת` → `/knesset`, current `ועדות הכנסת`); hidden on mobile (`max-width: 959px`).

## Behavior

### Chat navigation (WhatsApp groups)
- **Committees list** (default): rows with avatar initials + committee name; only committees with a ready transcript. Sorted **ועדה ראשית first**, then other types; within a type by **latest ready-transcript session** (newest first). Each row shows:
  - top-left: blue circle badge with ready-transcript **session count** (white number)
  - under title: **ישיבה אחרונה:** + date only
  - avatar: **chair photo** when available (else committee initials); no יו״ר name line
  - committee type (**ועדה ראשית** / **משנית**) sits beside the committee name
- Click committee → **sessions list** for that committee (ready transcripts only), with header **back** to committees. URL updates to `?committee=<id>`.
  - Session row title = **סדר היום** when available (up to 2 lines, then ellipsis); otherwise **ישיבה N**. Datetime (**day · time · date**) under the title; **message count** (transcript parts) as a muted badge at the bottom-left of the row. Avatar still shows the session number.
- Click session → **transcript chat** + committee table; chat header has **back** to sessions. URL updates to `?committee=<id>&session=<id>`.
- Opening a shared URL restores the matching committee list / sessions list / transcript view once data loads.
- Chat header subtitle on desktop: **day · time · date · פרוטוקול ישיבה N** (RTL — datetime on the right). On mobile: **day · time · date** only.
- No top-of-page ועדה/ישיבה dropdowns.

### Table
- Always visible on desktop (empty wood ring when no session is selected, with hint above: בחרו ישיבת וועדה על מנת להראות את המשתתפים מסביב לשולחן). Table is vertically centered with the chat box, then nudged slightly up (`translateY(-28px)`) so the **ועוד N חברי ועדה…** overflow note still sits within the chat column height. Hint is absolutely positioned above the ring so selecting a session does not shift the table. On mobile, shown only while a session transcript is open.
- Vertical (portrait) **hollow racetrack** — thick polished dark-brown wood ring with straighter long sides and rounded ends (less elliptical), open center.
- **Chair** at the head (top); **מנהל/ת הוועדה** (left) and **יועמ״ש** (right) staff seats flank them on the MK orbit (same seat size, photo radius ~28, solid grey ring — no dashed outline). Circles show the role labels **מנהל/ת** / **יועמ״ש** (not name initials). Names come from the protocol **מנהל(ת) הוועדה** / **ייעוץ משפטי** blocks: **click selects them**, highlights their chat bubbles (same as MKs), and the seat lights up during Play.
- **Full membership roster** around the table. All MK seats use a **grey ring**; when `knesset_committee_session_attendance` has rows for the session (parsed from protocol `נכחו` + `חברי הכנסת`), members not listed as present keep their seat with a **gray photo**; **guest MKs** listed under `חברי הכנסת` who are not committee members are still added in color. Without attendance data, everyone renders normally.
- Remaining members distributed around the oval rim (cap ~22; overflow note), clockwise from the top-right (just past יועמ״ש) ordered by **session message count** (most speeches first). Ties break by committee membership (חברי ועדה before guest MKs), then attendance (present before absent), then seat role, then Hebrew name. Quiet / unmatched speakers end up toward the left side near מנהל/ת.
- Click MK → selects them (blue-dark ring), highlights their chat messages, jumps chat to their first message. Click again clears selection.
- Hover MK seat → blue ring (no scale); tooltip appears centered **above** the seat photo with name, party, committee role (if any), and Knesset tenure (days/years + first elected year when known).
- Speaker attribution only uses `person_id` when that person is on the session roster (membership + attendance guests). Global ingest matches for people who were not at the sitting are ignored; the chat falls back to the protocol `speaker_header` text.
- Consecutive Hasadna parts whose `speaker_header` is not a credible speaker turn (sentence fragments like "ואני אומר לבנימין נתניהו", tiny OCR stubs of 1–2 letters) are **merged** into the previous speech bubble so one oration stays one message. Credible headers include role-prefixed speakers, seated MKs, multi-word Hebrew names, and **single first names** (e.g. guest "דובי") of 3–14 Hebrew letters — those stay as their own bubbles.
- During **Play**, the currently speaking MK’s seat gets a **blue** ring.

### Transcript chat
- Preamble / staff / **סדר** / **סדר היום** / **סדר-היום** blocks use WhatsApp **protocol notice** cards: centered pale-yellow rounded rectangles with lower opacity (**not clickable**). Detection normalizes bidi/niqqud and matches any header starting with סדר (also מסדר היום).
- **נכחו**, **חברי הכנסת**, **ייעוץ משפטי**, and **מנהל/ת הוועדה** roster cards are **omitted** from the chat (presence / staff seats are shown on the table). Named speech turns by those staff still appear and link to the seats.
- **Play** keeps yellow protocol/meta cards visible from the start, then **pops** real speech messages from the first MK part onward every **3s**. **Pause** then **Play** resumes from the same message; restart from the first speech only after the run finishes.
- Transcript thread is **virtualized** (`@tanstack/react-virtual`) so long sittings (3000+ parts) only mount visible rows; Play/jump use `scrollToIndex`. Meta detection uses a precomputed first-speech index (no O(n²) scans).
- Bottom composer floats over the WhatsApp wallpaper (transparent footer): white rounded pill with **session word search** + match count, **prev / play / next** on the visual-left of the pill, and a blue circular **AI** button to the left of the pill. Clicking AI calls `POST /api/knesset/committee-session-summary` (OpenAI, needs `OPENAI_API_KEY` + `SUPABASE_SERVICE_KEY` to persist). If `knesset_committee_session_transcripts.ai_summary` already exists for the session, that cached text is returned (`cached: true`) with no new model call; otherwise a short Hebrew paragraph is generated starting with **בישיבה זו** (no date/time/session-number preamble), covering סדר היום + main discussion points + votes when present, saved on the transcript row, and shown in a card titled **סיכום הישיבה בAI**. Long transcripts are capped at ~55k chars by keeping the **start + end** (middle dropped) so late **votes** still reach the model. Search highlights matching text and dims non-matches.
- Header uses site blue with **back**, title = committee name, subtitle = **day · time · date · פרוטוקול ישיבה N** (mobile: datetime only).
- The leading untitled protocol preamble card is omitted from the chat.
- Active speech bubble gets a blue ring only after Play / bubble click / prev-next (nothing highlighted on session load). Clicking an MK speech bubble jumps Play to that ordinal (protocol notice cards do not).
- Each MK bubble shows **name + faction/party** on one row.
- With an MK / יועמ״ש / מנהל/ת selected: their bubbles stay emphasized, others dim; footer **prev/next** jump only among that speaker’s messages; clear filter with the **X** on the filter bar.

## Data queries

1. Resolve `knessets.id` where `knesset_number = 25` → `knesset_committees`, then keep only committees that appear on a ready `knesset_committee_session_transcripts` row (via session). Aggregate per committee: ready-session **count** + **latest `start_at`**, and load current **chair** (name + photo) from memberships (`seat_role = chair`). Sort **ועדה ראשית** first, then by latest session descending.
2. Sessions for `committee_id`; mark `hasTranscript` via ready transcripts for those session ids (chunked `.in`). Fetch first `סדר היום` part body per session for the sessions list subtitle, and exact `knesset_committee_transcript_parts` counts per session for the message badge.
3. Memberships for committee, filtered to session date; join `people`. Enrich with factions (`usePersonFactions`) and tenure (`usePersonTenures` from `knesset_memberships`).
4. Attendance for `session_id` (when present, absentees are grayed; guests may be added).
5. Transcript by `session_id` + parts ordered by `ordinal`, join `people`. Parts are **paged** in chunks of 1000 (PostgREST default cap) so long sittings keep the full protocol through `הישיבה ננעלה`, not only the first ~1000 turns. Session-list message badges use an exact DB count, which previously looked higher than the chat until paging was added.

## Ingest

**Script:** `Layer 1 - Gathering Data/knesset/load_knesset_committees.py`  
**Self-parse helper:** `Layer 1 - Gathering Data/knesset/committee_protocol_parse.py`  
**Schema:** `Layer 1 - Gathering Data/knesset/schema_knesset_committees.sql`  
Weekly via `.github/workflows/knesset-pipeline.yml` (200 newest missing transcripts/run; installs `antiword`).

Transcript sync is **hybrid**:
1. Prefer Hasadna parsed text/parts when the joined dump lists filenames for the session.
2. Otherwise download the protocol DOC/DOCX `FilePath` (from dataservice document dump / OData) and split speakers locally (`source=parsed_file`).
3. Sessions with neither Hasadna parts nor a DOC URL are skipped until a protocol file appears (Knesset often publishes DOCs days/weeks after the sitting).

### Targeted fetch (committee + day)

To pull all sittings for a committee on a calendar day without waiting for the weekly newest-200 batch:

```bash
cd "Layer 1 - Gathering Data/knesset"
python load_knesset_committees.py --committee "ועדת הכספים" --date 2024-03-12
```

- `--committee` — Hebrew name (exact, else unique case-insensitive substring) **or** numeric `knesset_committee_id`
- `--date YYYY-MM-DD` — sitting day in **Asia/Jerusalem** (matches `start_at` on that calendar day). **All** sessions that day are fetched.
- `--session-oid` — optional: pin a single Knesset `CommitteeSessionID` instead of every sitting that day
- With `--table all` (default) + both flags: runs **sessions → documents → transcripts** only (skips committees/memberships refresh). `--transcripts-limit` is ignored.
- Transcript-only if metadata already synced: `--table transcripts --committee … --date …`
- Default `--transcripts-mode missing` skips sittings that already have a ready transcript; use `--transcripts-mode all` to re-parse.
- Needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in `.env`, and `antiword` (or WSL) for `.doc` self-parse.

Attendance is extracted from transcript parts with headers `נכחו` (committee members) and `חברי הכנסת` (guest MKs who are not committee members) whenever transcripts are synced, and can be backfilled with:

```bash
python load_knesset_committees.py --table attendance
```

The UI merges those attendance rows onto the table even when the person is not in `knesset_committee_memberships`.

## Out of scope (later)

- Keyword search (FTS on parts already indexed)
- Timed audio sync (`start_offset_ms`)
