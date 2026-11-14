import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  committeeKnessetLabel,
  committeeKnessetsFromSessionRows,
  resolveCommitteeKnesset,
  type CommitteeKnessetOption,
  type SessionKnessetRow,
} from './committeeKnessetOptions.ts'

function option(
  id: number,
  knessetNumber: number,
  isCurrent = false,
): CommitteeKnessetOption {
  return {
    id,
    knessetNumber,
    label: `הכנסת ה-${knessetNumber}`,
    isCurrent,
  }
}

describe('committee knesset options', () => {
  it('keeps one row per knesset and sorts newest first', () => {
    const rows: SessionKnessetRow[] = [
      {
        committee: {
          knesset: {
            id: 10,
            knesset_number: 25,
            knesset_name: 'הכנסת ה-25',
            is_active: false,
          },
        },
      },
      {
        committee: [
          {
            knesset: [
              {
                id: 10,
                knesset_number: 25,
                is_active: false,
              },
            ],
          },
        ],
      },
      {
        committee: {
          knesset: {
            id: 20,
            knesset_number: 26,
            knesset_name: null,
            is_active: true,
          },
        },
      },
      { committee: { knesset: null } },
    ]
    const options = committeeKnessetsFromSessionRows(rows)
    assert.deepEqual(
      options.map((item) => item.knessetNumber),
      [26, 25],
    )
    assert.equal(options[0]?.label, 'הכנסת ה-26')
    assert.equal(options[0]?.isCurrent, true)
    assert.equal(options[1]?.label, 'הכנסת ה-25')
  })

  it('uses the stored knesset name when it is present', () => {
    assert.equal(committeeKnessetLabel(25, '  הכנסת העשרים וחמש '), 'הכנסת העשרים וחמש')
    assert.equal(committeeKnessetLabel(26, '  '), 'הכנסת ה-26')
  })

  it('defaults to the current knesset, then the newest with sessions', () => {
    const options = [option(2, 26, false), option(1, 25, true)]
    assert.equal(resolveCommitteeKnesset(null, options)?.knessetNumber, 25)
    assert.equal(resolveCommitteeKnesset(26, options)?.knessetNumber, 26)
    assert.equal(resolveCommitteeKnesset(24, options)?.knessetNumber, 25)

    const withoutCurrent = [option(2, 26, false), option(1, 25, false)]
    assert.equal(
      resolveCommitteeKnesset(null, withoutCurrent)?.knessetNumber,
      26,
    )
    assert.equal(resolveCommitteeKnesset(null, []), null)
  })
})
