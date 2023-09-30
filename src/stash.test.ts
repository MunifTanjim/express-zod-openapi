import { Handler } from 'express'
import { Stash } from './stash'

describe('Stash', () => {
  test('with symbol stashKey', () => {
    const stash = new Stash<string>(Symbol('forty-two'))

    const handler: Handler = () => {
      return
    }

    stash.store(handler, 'pong')

    expect(Object.getOwnPropertySymbols(handler)).toMatchInlineSnapshot(`
      Array [
        Symbol(forty-two),
      ]
    `)

    expect(
      stash.find(
        {
          path: '',
          stack: [{ handle: handler, method: 'get' } as any],
          methods: { get: true },
        },
        'get',
      ),
    ).toBe('pong')

    expect(
      stash.find(
        {
          path: '',
          stack: [{ handle: handler, method: 'get' } as any],
          methods: { get: true },
        },
        'post',
      ),
    ).toBe(null)
  })

  test('with string stashKey', () => {
    const stash = new Stash<string>('forty-two')

    const handler: Handler = () => {
      return
    }

    stash.store(handler, 'pong')

    expect(Object.keys(handler)).toMatchInlineSnapshot(`
      Array [
        "forty-two",
      ]
    `)

    expect(
      stash.find(
        {
          path: '',
          stack: [{ handle: handler, method: 'get' } as any],
          methods: { get: true },
        },
        'get',
      ),
    ).toBe('pong')
  })
})
