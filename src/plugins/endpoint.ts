import {
  Router,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type Handler,
  type NextFunction,
} from 'express'
import { z, type Schema, type TypeOf } from 'zod'
import type { HttpMethod } from '../types'
import { setupResponseValidation, validateRequest } from '../utils'
import { SpecificationPlugin } from './specification'
import type {
  ExpressOpenAPIPlugin,
  RequestSegment,
  ResponseSegment,
  RouteProcessor,
} from './types'

type SpecInfo = {
  defaultStatusCode: number
  operationId?: string
  req: Map<RequestSegment, Schema<any> | undefined>
  res: Map<
    string,
    | {
        [segment in ResponseSegment]?: Schema<any>
      }
    | undefined
  >
}

type SpecificationSchema = {
  operationId?: string
  req?: {
    [segment in RequestSegment]?: Schema<any>
  }
  res?: {
    [statusCode: string]: {
      [segment in ResponseSegment]?: Schema<any>
    }
  }
}

type UnionTypeOf<T extends Schema<any>> = T extends unknown ? TypeOf<T> : never

type ResponseSegmentType<
  VS extends SpecificationSchema,
  S extends ResponseSegment,
  D = unknown,
> = VS['res'] extends undefined
  ? D
  : NonNullable<VS['res']>[keyof NonNullable<VS['res']>][S] extends undefined
  ? D
  : UnionTypeOf<
      NonNullable<NonNullable<VS['res']>[keyof NonNullable<VS['res']>][S]>
    >

type RequestSegmentType<
  VS extends SpecificationSchema,
  S extends RequestSegment,
  D = unknown,
> = VS['req'] extends undefined
  ? D
  : NonNullable<VS['req']>[S] extends undefined
  ? D
  : TypeOf<NonNullable<NonNullable<VS['req']>[S]>>

type Response<S extends SpecificationSchema> = ExpressResponse<
  ResponseSegmentType<S, 'body'>
>

type Request<S extends SpecificationSchema> = ExpressRequest<
  RequestSegmentType<S, 'params'>,
  ResponseSegmentType<S, 'body'>,
  RequestSegmentType<S, 'body'>,
  RequestSegmentType<S, 'query'>
>

type MaybePromise<T> = Promise<T> | T

const specInfoSymbol = Symbol('zod-openapi-endpoint-specInfo')

type SpecificationChain<
  Schema extends SpecificationSchema,
  Called extends '' | 'req' | 'res',
> = Handler[] &
  Omit<
    {
      req: <T extends NonNullable<SpecificationSchema['req']>>(
        schema: T,
      ) => SpecificationChain<Schema & { req: T }, Called | 'req'>
      res: <T extends NonNullable<SpecificationSchema['res']>>(
        schema: T,
      ) => SpecificationChain<Schema & { res: T }, Called | 'res'>
    },
    Called
  > & {
    [specInfoSymbol]: SpecInfo
    router: Router
    handle: (
      handler: (
        req: Request<Schema>,
        res: Response<Schema>,
        next: NextFunction,
      ) =>
        | MaybePromise<ResponseSegmentType<Schema, 'body'>>
        | MaybePromise<void>,
    ) => SpecificationChain<Schema, Called | 'req' | 'res'>
  }

function SpecChainReq<
  S extends SpecificationSchema,
  C extends '' | 'req' | 'res',
  T extends NonNullable<SpecificationSchema['req']>,
>(this: SpecificationChain<S, C>, spec: T) {
  const specInfo = this[specInfoSymbol]

  for (const [segment, schema] of Object.entries(spec)) {
    specInfo.req.set(segment as RequestSegment, schema)
  }

  return this as unknown as SpecificationChain<S & { req: T }, C | 'req'>
}

function SpecChainRes<
  S extends SpecificationSchema,
  C extends '' | 'req' | 'res',
  T extends NonNullable<SpecificationSchema['res']>,
>(this: SpecificationChain<S, C>, spec: T) {
  const specInfo = this[specInfoSymbol]

  for (const [code, schemaBySegment] of Object.entries(spec)) {
    const statusCode = Number(code)
    if (200 < statusCode && statusCode < 300) {
      specInfo.defaultStatusCode = statusCode
    }

    specInfo.res.set(
      code,
      Object.entries(schemaBySegment).reduce<{
        [key in ResponseSegment]?: Schema<unknown>
      }>((bySegment, [segment, schema]) => {
        if (schema) {
          bySegment[segment as ResponseSegment] = schema
        }
        return bySegment
      }, {}),
    )
  }

  if (specInfo.res.size > 0 && !specInfo.res.has('default')) {
    specInfo.res.set('default', { body: z.any() })
  }

  return this as unknown as SpecificationChain<S & { res: T }, C | 'res'>
}

function SpecChainHandle<
  S extends SpecificationSchema,
  C extends '' | 'req' | 'res',
>(
  this: SpecificationChain<S, C>,
  handler: (
    req: Request<S>,
    res: Response<S>,
    next: NextFunction,
  ) => MaybePromise<ResponseSegmentType<S, 'body'>> | MaybePromise<void>,
) {
  if (handler.length === 3) {
    this.router.use(handler)
  } else {
    this.router.use(async (req, res, next) => {
      const response = await handler(req, res, next)
      if (res.headersSent) {
        return
      }

      if (typeof response === 'undefined') {
        return next()
      }

      if (res.statusCode === 200) {
        res.statusCode = this[specInfoSymbol].defaultStatusCode
      }

      res.json(response)
    })
  }

  return this as SpecificationChain<S, C | 'req' | 'res'>
}

function SpecChain(
  getRouter: (specInfo: SpecInfo) => Router,
): SpecificationChain<Record<string, never>, ''> {
  const specInfo: SpecInfo = {
    defaultStatusCode: 200,
    req: new Map(),
    res: new Map(),
  }

  const chain = Object.assign([], {
    [specInfoSymbol]: specInfo,
    router: getRouter(specInfo),
    req: SpecChainReq,
    res: SpecChainRes,
    handle: SpecChainHandle,
  })

  return chain
}

export type GetEndpointMiddleware = (
  method: HttpMethod,
  path: string,
) => ReturnType<typeof SpecChain>

type EndpointPlugin = ExpressOpenAPIPlugin<SpecInfo, GetEndpointMiddleware>

const routeProcessor: RouteProcessor<SpecInfo> = (
  specification,
  specInfo,
  { method, path },
) => {
  SpecificationPlugin.routeProcessor(specification, specInfo, {
    method,
    path,
  })
}

const create = ({
  req: reqConfig = {},
  res: resConfig = {},
}: {
  req?: {
    segmentOrder?: RequestSegment[]
    skipValidation?: boolean
  }
  res?: {
    segmentOrder?: ResponseSegment[]
    skipValidation?: boolean
  }
} = {}) => {
  const {
    segmentOrder: reqSegmentOrder = [
      'headers',
      'params',
      'query',
      'cookies',
      'signedCookies',
      'body',
    ],
    skipValidation: skipRequestValidation = false,
  } = reqConfig

  const {
    segmentOrder: resSegmentOrder = ['body', 'headers'],
    skipValidation: skipResponseValidation = false,
  } = resConfig

  const router = Router()

  const endpointPlugin: EndpointPlugin = {
    name: 'zod-openapi-endpoint-plugin',

    getMiddleware: (internals, method, path) => {
      return SpecChain((specInfo) => {
        const validationMiddleware: Handler = async (
          req,
          res,
          next,
        ): Promise<void> => {
          if (!skipResponseValidation && specInfo.res.size) {
            setupResponseValidation(res, specInfo.res, resSegmentOrder, next)
          }

          if (!skipRequestValidation && specInfo.req.size) {
            try {
              await validateRequest(req, specInfo.req, reqSegmentOrder)
            } catch (err) {
              next(err)
              return
            }
          }

          next()
        }

        internals.stash.store(validationMiddleware, specInfo)

        return router[method](path, validationMiddleware)
      })
    },

    processRoute: routeProcessor,
  }

  return Object.assign(endpointPlugin, { router })
}

export const EndpointPlugin = {
  create,
  routeProcessor,
}
