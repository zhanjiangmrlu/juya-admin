import { expect, it } from 'vitest'

import { contactSourceText } from './display'

it.each([
  ['user_entered_unverified', '用户填写／未验证'],
  [null, '历史来源未核实'],
  ['unknown', '历史来源未核实']
] as const)('does not label %s contact data as verified', (source, label) => {
  expect(contactSourceText(source)).toBe(label)
})
