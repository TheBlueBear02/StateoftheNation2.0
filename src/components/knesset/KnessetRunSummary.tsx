import type { PipelineRunSummary } from '../../lib/runKnessetPipeline'

const TABLE_LABELS: Record<string, string> = {
  knessets: 'כנסות',
  people: 'אנשים',
  knesset_factions: 'סיעות',
  offices: 'משרדים',
  governments: 'ממשלות',
  knesset_memberships: 'חברויות',
  'knesset_memberships.faction_id': 'קישורי סיעות (faction_id)',
  knesset_memberships_faction_id: 'קישורי סיעות (faction_id)',
  minister_appointments: 'מינויים',
  'people.image_url': 'תמונות (image_url)',
  pipeline_sync_state: 'מצב סנכרון',
  raw_poll_rows: 'שורות גולמיות',
  polls: 'סקרים',
  poll_aggregates: 'ממוצעים',
}

function formatTableLabel(table: string | undefined): string {
  if (!table) {
    return '—'
  }
  return TABLE_LABELS[table] ?? table
}

export function KnessetRunSummary({
  summary,
  title = 'סיכום השינויים',
}: {
  summary: PipelineRunSummary | null
  title?: string
}) {
  if (!summary || summary.stages.length === 0) {
    return null
  }

  return (
    <div className="knesset-run-summary">
      <h3 className="knesset-run-summary__title">{title}</h3>
      <table className="party-pipeline-panel__table knesset-run-summary__table">
        <thead>
          <tr>
            <th>שלב / טבלה</th>
            <th>סה״כ</th>
            <th>חדשים</th>
            <th>עודכנו</th>
          </tr>
        </thead>
        <tbody>
          {summary.stages.flatMap((stage) => {
            const rows = stage.entries?.length
              ? stage.entries.map((entry) => ({
                  key: `${stage.label}-${entry.table ?? 'entry'}`,
                  label: stage.stage
                    ? `${stage.stage}. ${stage.label} — ${formatTableLabel(entry.table)}`
                    : `${stage.label} — ${formatTableLabel(entry.table)}`,
                  upserted: entry.upserted,
                  inserted: entry.inserted,
                  updated: entry.updated,
                  note:
                    entry.unmatched !== undefined
                      ? `${entry.unmatched} ללא התאמה`
                      : null,
                }))
              : [
                  {
                    key: stage.label,
                    label: stage.stage
                      ? `${stage.stage}. ${stage.label}`
                      : stage.label,
                    upserted: stage.upserted,
                    inserted: stage.inserted,
                    updated: stage.updated,
                    note: stage.note ?? null,
                  },
                ]

            return rows.map((row) => (
              <tr key={row.key}>
                <td>
                  {row.label}
                  {row.note ? (
                    <span className="knesset-run-summary__note"> ({row.note})</span>
                  ) : null}
                </td>
                <td>{row.upserted.toLocaleString('he-IL')}</td>
                <td>{row.inserted.toLocaleString('he-IL')}</td>
                <td>{row.updated.toLocaleString('he-IL')}</td>
              </tr>
            ))
          })}
          <tr className="knesset-run-summary__totals">
            <td>סה״כ</td>
            <td>{summary.totals.upserted.toLocaleString('he-IL')}</td>
            <td>{summary.totals.inserted.toLocaleString('he-IL')}</td>
            <td>{summary.totals.updated.toLocaleString('he-IL')}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
