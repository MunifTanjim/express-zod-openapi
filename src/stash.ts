import type { Handler } from 'express'
import type { Route } from './openapi/express'
import type { HttpMethod } from './types'

export class Stash<Value> {
  private stashKey: string | symbol

  constructor(stashKey: string | symbol) {
    this.stashKey = stashKey
  }

  find = (route: Route, method: HttpMethod): Value | null => {
    for (const layer of route.stack) {
      if (layer.method === method) {
        const descriptor = Object.getOwnPropertyDescriptor(
          layer.handle,
          this.stashKey,
        )
        if (descriptor) {
          return descriptor.value
        }
      }
    }

    return null
  }

  store = (handler: Handler, value: Value): void => {
    Object.defineProperty(handler, this.stashKey, {
      value,
      enumerable: true,
    })
  }
}
