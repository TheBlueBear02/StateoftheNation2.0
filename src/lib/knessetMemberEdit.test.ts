import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  imageExtension,
  mergeManualFields,
  parseMemberEdit,
} from './knessetMemberEdit.ts'

const base = {
  membershipId: 3,
  personId: 9,
  knessetId: 157,
  fullName: 'ישראל ישראלי',
  gender: 'זכר',
  birthDate: '1970-01-02',
  email: 'a@example.com',
  imageUrl: 'https://example.com/a.jpg',
  twitterHandle: '@israel',
  wikipediaUrl: 'https://he.wikipedia.org/wiki/Example',
  factionId: 4,
}

describe('knesset member edit', () => {
  it('accepts a complete member and strips a twitter @', () => {
    const parsed = parseMemberEdit(base)
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.value.twitterHandle, 'israel')
      assert.equal(parsed.value.factionId, 4)
    }
  })

  it('allows clearing the faction', () => {
    const parsed = parseMemberEdit({ ...base, factionId: null, gender: '' })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.value.factionId, null)
      assert.equal(parsed.value.gender, null)
    }
  })

  it('rejects a faction from outside the form and a bad photo url', () => {
    assert.equal(parseMemberEdit({ ...base, fullName: '  ' }).ok, false)
    assert.equal(parseMemberEdit({ ...base, imageUrl: 'not a url' }).ok, false)
    assert.equal(parseMemberEdit({ ...base, gender: 'אחר' }).ok, false)
  })

  it('keeps only known manual fields', () => {
    assert.deepEqual(
      mergeManualFields(['full_name', 'nope'], ['image_url', 'is_current']),
      ['full_name', 'image_url'],
    )
    assert.equal(imageExtension('image/jpeg'), 'jpg')
    assert.equal(imageExtension('image/gif'), null)
  })
})
