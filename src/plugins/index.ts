import type { Handler } from 'express'
import type { OpenAPISpecification } from '../openapi'
import type { Stash } from '../stash'
import type { HttpMethod } from '../types'

export type ExpressOpenAPIPluginInternals<StashValue> = {
  specification: OpenAPISpecification
  stash: Stash<StashValue>
}

export type RouteProcessor<StashValue> = (
  specification: OpenAPISpecification,
  stash: StashValue,
  info: {
    path: string
    method: HttpMethod
  },
) => void

export interface ExpressOpenAPIPlugin<
  StashValue = unknown,
  GetMiddleware extends (...params: any[]) => Handler | Handler[] = (
    ...params: any[]
  ) => Handler,
> {
  name: string
  getMiddleware: (
    internals: ExpressOpenAPIPluginInternals<StashValue>,
    ...params: Parameters<GetMiddleware>
  ) => ReturnType<GetMiddleware>
  processRoute: RouteProcessor<StashValue>
}

export interface RegisteredExpressOpenAPIPlugin {
  name: string
  specification: OpenAPISpecification
  stash: Stash<any>
  processRoute: RouteProcessor<any>
}
