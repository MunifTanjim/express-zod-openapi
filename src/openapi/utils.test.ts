import { isReferenceObject } from './utils'

describe('openapi/utils', () => {
  describe('isReferenceObject', () => {
    test('works as expected', () => {
      expect(isReferenceObject({ $ref: '#/components/schema/Pong' })).toBe(true)
      expect(isReferenceObject({ ping: { pong: 42 } })).toBe(false)
    })
  })
})
