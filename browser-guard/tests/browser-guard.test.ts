import { expect, test } from 'claude-code/testing'

import { activeEmail, inUseBrowser, mismatch } from '../hooks/parse'

const one = { deviceId: 'd1', name: 'Browser 1' }
const two = { deviceId: 'd2', name: 'Browser 2' }

test('pairs and mismatches', async () => {
  expect(activeEmail("Status: Account-2 (two@example.com [two@example.com's Organization])")).toBe('two@example.com')
  expect(inUseBrowser(JSON.stringify([{ ...one, inUse: false }, { ...two, inUse: true }]))?.deviceId).toBe('d2')
  expect(inUseBrowser('[]')).toBe(null)
  expect(mismatch('a@x', one, {})).toBe(null)
  expect(mismatch('a@x', one, { 'a@x': one })).toBe(null)
  expect(mismatch('a@x', two, { 'a@x': one })).toMatch(/not the profile paired/)
  expect(mismatch('b@x', one, { 'a@x': one })).toMatch(/is the profile for a@x/)
})
