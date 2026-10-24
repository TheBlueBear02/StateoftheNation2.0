# GovernmentBordersPage — ג"ג · גבולות גזרה לממשלה

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), [PollsPage.md](./PollsPage.md), and [ElectionsPage.md](./ElectionsPage.md).

Interactive tool for drawing a contiguous “government” band across parties on a fixed political axis, using the latest seat poll for a chosen media channel.

## Route

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections/government-borders` | `src/views/GovernmentBordersPage.tsx` | Channel selector, seat bars, range picker, share poster |

Static App Router segment: `src/app/elections/government-borders/page.tsx` (takes priority over `[partyId]`). Metadata title: **ג"ג - גבולות גזרה לממשלה**. WebPage + Breadcrumb JSON-LD. Client view wrapped in `Suspense` because it reads `useSearchParams`.

Linked from the `/elections` hero (“שרטטו את גבולות הגזרה לממשלה”) and listed in `src/app/sitemap.ts`.

## UX

1. **Channel** — up to **5** publisher logos (newest distinct channels by fieldwork end via `BORDERS_CHANNEL_LIMIT`); selecting one loads that publisher’s **latest non-scenario poll** (`selectRecentRegularPollsForPublisher(..., 1)`). Logos only (plus a short “click logo” hint) — no channel name / fieldwork date under the row. Default = publisher of the newest poll overall. A `?channel=` outside the top 5 falls back to the first listed channel. Channel + date still appear on the share poster.
2. **Bars** — one column per party with `seats > 0`. Order (RTL, index 0 = rightmost) from `orderBordersParties`: pinned Haredi parties (**ש"ס**, **יהדות התורה**, **הציבור החרדי**) on the far right, then remaining **coalition** ascending by seats, then other **unaligned**/null descending, then **עמך ישראל** then **המילואימניקים** between the blocs (מילואימניקים to the left of עמך), then remaining **opposition** descending, then pinned Arabic parties (**רע"ם**, **הרשימה המשותפת**) on the far left. **ישראל ביתנו** is forced immediately after **ישר**. **עוצמה יהודית** and **הציונות הדתית** swap after the seats sort. Bloc-colored vertical bar, seat count, list-leader photo (`list_position = 1`), `short_name`. Leader avatars for **בנט** and **הרשימה המשותפת** use a raised `object-position` (`bordersAvatarObjectPosition`) so faces sit higher in the circle. Axis end labels: קואליציה → אופוזיציה. Parties outside the selected range are dimmed. **Mobile (≤720px):** chart bleeds to the screen edges, all columns share the viewport width (no horizontal scroll), shorter plot, compact avatars, party names hidden (identity via avatar + `title`).
3. **Range picker** — black window under the bars. Drag body to move; drag edge handles to resize; tap the grey track outside the window to grow that edge; snaps to whole columns. Keyboard: arrows move, Shift+arrows resize start edge / grow end. `role="slider"`. **Mobile:** taller track (~52px), larger edge hit targets (~44px), pointer capture while dragging.
4. **Summary** — “ממשלה: X מנדטים” + “יש רוב” when X ≥ 61, else “חסרים N”. Bottom 0–120 bar (selected government vs outside) with a 61 marker. Strip uses teal `#1f7a6c` / amber `#c47a3a` (`BORDERS_SUMMARY_*`) — not the party-bar bloc blue/red — so it does not look like the same coalition/opposition coding as the columns.
5. **Share** — off-screen poster via `exportNodeToPng` + `sharePngImage` (same pattern as dream-government leaders poster).
6. **URL state** — `?channel=&from=&to=` kept in sync with `router.replace` so shared links restore selection.

## Data

- Polls: `usePolls(120)` → `listBordersChannels` (max `BORDERS_CHANNEL_LIMIT = 5`) / `getChannelPoll` in `src/lib/governmentBorders.ts`.
- Leaders: exported `fetchPartyLeaders` from `src/lib/fetchElectionParties.ts` (candidates at `list_position = 1`). Hook: `useGovernmentBordersData`. Fallback: party logo → color initials circle.
- Party order: computed per poll from `election_parties.bloc` + seats (see `orderBordersParties`). Axis labels live in `src/content/governmentBordersTopics.ts`.
- Majority constant: `BORDERS_MAJORITY = 61`. Default range = Haredi pin + full coalition wing when present; otherwise grow from the rightmost column until seats ≥ 61.

## Files

| File | Role |
|------|------|
| `src/app/elections/government-borders/page.tsx` | Metadata + JSON-LD + Suspense |
| `src/views/GovernmentBordersPage.tsx` / `.css` | Page shell, URL sync, share button |
| `src/content/governmentBordersTopics.ts` | Axis end labels (קואליציה / אופוזיציה) |
| `src/lib/governmentBorders.ts` | Channels, bloc+size party ordering, range math |
| `src/hooks/useGovernmentBordersData.ts` | Polls + leaders → ordered columns |
| `src/components/elections/borders/BordersToolbar.tsx` | Channel controls |
| `src/components/elections/borders/BordersBarsChart.tsx` | Seat bars + avatars |
| `src/components/elections/borders/BordersRangePicker.tsx` | Draggable/resizable range |
| `src/components/elections/borders/BordersSummaryBar.tsx` | Totals + 0–120 bar |
| `src/components/elections/borders/ShareableBordersPoster.tsx` | Off-screen share card |
