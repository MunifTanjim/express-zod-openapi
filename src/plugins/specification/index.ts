import type { Handler } from 'express'
import type {
  HeaderObject,
  HeadersObject,
  ParameterLocation,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
} from 'openapi3-ts'
import type { Schema } from 'zod'
import type { ExpressOpenAPIPlugin, RouteProcessor } from '..'
import type { RequestSegment, ResponseSegment } from '../../types'
import { setupResponseValidation, validateRequest } from '../../utils'
import { zodToJsonSchema } from '../../zod'
import type { SpecificationSchema } from './types'

export type {
  Request,
  RequestHandler,
  RequestSegmentType,
  Response,
  ResponseSegmentType,
  SpecificationSchema,
} from './types'

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
