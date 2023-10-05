import type {
  Request as ExpressRequest,
  RequestHandler as ExpressRequestHandler,
  Response as ExpressResponse,
  Handler,
} from 'express'
import type {
  HeaderObject,
  HeadersObject,
  ParameterLocation,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
} from 'openapi3-ts'
import type { Schema, TypeOf } from 'zod'
import { setupResponseValidation, validateRequest } from '../utils'
import { zodToJsonSchema } from '../zod'
import type {
  ExpressOpenAPIPlugin,
  RequestSegment,
  ResponseSegment,
  RouteProcessor,
} from './types'

export type { RequestSegment, ResponseSegment } from './types'

type SpecInfo = {
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

export type Response<S extends SpecificationSchema> = ExpressResponse<
  ResponseSegmentType<S, 'body'>
>

export type Request<S extends SpecificationSchema> = ExpressRequest<
  RequestSegmentType<S, 'params'>,
  ResponseSegmentType<S, 'body'>,
  RequestSegmentType<S, 'body'>,
  RequestSegmentType<S, 'query'>
>

export type RequestHandler<S extends SpecificationSchema> =
  ExpressRequestHandler<
    RequestSegmentType<S, 'params'>,
    ResponseSegmentType<S, 'body'>,
    RequestSegmentType<S, 'body'>,
    RequestSegmentType<S, 'query'>
  >

export type GetSpecificationMiddleware = (
  schema: SpecificationSchema,
) => Handler

type SpecificationPlugin = ExpressOpenAPIPlugin<
  SpecInfo,
  GetSpecificationMiddleware
>

const parameterLocationBySegment: {
  [key in Exclude<RequestSegment, 'body'>]: ParameterLocation
} = {
  cookies: 'cookie',
  signedCookies: 'cookie',
  headers: 'header',
  params: 'path',
  query: 'query',
}

const routeProcessor: RouteProcessor<SpecInfo> = (
  specification,
  specInfo,
  { path, method },
) => {
  for (const [segment, schema] of specInfo.req.entries()) {
    if (!schema) {
      continue
    }

    if (specInfo.operationId) {
      specification.setPathItemOperation(path, method, {
        ...specification.getPathItemOperation(path, method)!,
        operationId: specInfo.operationId,
      })
    }

    if (segment === 'body') {
      const result = zodToJsonSchema(schema)

      const requestBody: RequestBodyObject = {
        content: {
          'application/json': {
            // @ts-expect-error ...
            schema: result,
          },
        },
      }

      specification.setPathItemOperationRequestBody(path, method, requestBody)

      continue
    }

    const location = parameterLocationBySegment[segment]

    const result = zodToJsonSchema(schema)

    if ('properties' in result) {
      const { properties, required = [] } = result

      if (properties) {
        for (const [name, schema] of Object.entries(properties)) {
          const parameterObject: ParameterObject = {
            name,
            in: location,
            // @ts-expect-error ...
            schema: schema,
            required: required.includes(name),
          }

          specification.addPathItemOperationParameter(
            path,
            method,
            parameterObject,
          )
        }
      }
    }
  }

  for (const [key, schemaBySegment] of specInfo.res.entries()) {
    if (!schemaBySegment) {
      continue
    }

    const httpStatusCode = key as number | 'default'

    if (schemaBySegment.body) {
      const result = zodToJsonSchema(schemaBySegment.body)

      const responseObject: ResponseObject = {
        ...specification.getPathItemOperationResponse(
          path,
          method,
          httpStatusCode,
        ),
        description: '',
        content: {
          'application/json': {
            // @ts-expect-error ...
            schema: result,
          },
        },
      }

      specification.setPathItemOperationResponse(
        path,
        method,
        httpStatusCode,
        responseObject,
      )
    }

    if (schemaBySegment.headers) {
      const result = zodToJsonSchema(schemaBySegment.headers)

      if ('properties' in result) {
        const { properties, required = [] } = result

        const headersObject: HeadersObject = {}

        if (properties) {
          for (const [name, schema] of Object.entries(properties)) {
            const headerObject: HeaderObject = {
              // @ts-expect-error ...
              schema: schema,
              required: required.includes(name),
            }

            headersObject[name] = headerObject
          }
        }

        const responseObject: ResponseObject = {
          ...specification.getPathItemOperationResponse(
            path,
            method,
            httpStatusCode,
          ),
          description: '',
          headers: headersObject,
        }

        specification.setPathItemOperationResponse(
          path,
          method,
          httpStatusCode,
          responseObject,
        )
      }
    }
  }
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
} = {}): SpecificationPlugin => {
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

  const specificationPlugin: SpecificationPlugin = {
    name: 'zod-openapi-spec',

    getMiddleware: (internals, validationSchema): Handler => {
      const specInfo: SpecInfo = {
        operationId: validationSchema.operationId,
        req: new Map(),
        res: new Map(),
      }

      for (const segment of reqSegmentOrder) {
        const schema = validationSchema.req?.[segment]
        if (schema) {
          specInfo.req.set(segment, schema)
        }
      }

      for (const [code, schemaBySegment] of Object.entries(
        validationSchema.res ?? {},
      )) {
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

      const validationMiddleware: Handler = async (
        req,
        res,
        next,
      ): Promise<void> => {
        if (!skipResponseValidation && validationSchema.res) {
          setupResponseValidation(res, specInfo.res, resSegmentOrder, next)
        }

        if (!skipRequestValidation && validationSchema.req) {
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

      return validationMiddleware
    },

    processRoute: routeProcessor,
  }

  return specificationPlugin
}

/**
 * @deprecated Use `SpecificationPlugin.create`
 */
export const getSpecificationPlugin = create

export const SpecificationPlugin = {
  create,
  routeProcessor,
}
