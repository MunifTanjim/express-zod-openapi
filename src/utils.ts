import type { Request, Response } from 'express'
import type { Schema } from 'zod'
import type { RequestSegment, ResponseSegment } from './types'
import { RequestValidationError, ResponseValidationError } from './zod'

export async function validateRequest(
  req: Request,
  spec: Map<RequestSegment, Schema<any> | undefined>,
  segmentOrder: RequestSegment[],
) {
  await segmentOrder.reduce((promise, segment) => {
    return promise.then(async () => {
      const schema = spec.get(segment)

      if (!schema) {
        return null
      }

      const result = await schema.safeParseAsync(req[segment])

      if (!result.success) {
        throw new RequestValidationError(result.error, segment)
      }

      req[segment] = result.data

      return null
    })
  }, Promise.resolve(null))
}

export function setupResponseValidation(
  res: Response,
  spec: Map<string, { [segment in ResponseSegment]?: Schema<any> } | undefined>,
  segmentOrder: ResponseSegment[],
  next: (err?: unknown) => void,
) {
  const originalSend = res.send

  res.send = function validateAndSendResponse(...args) {
    res.send = originalSend

    const body = args[0]

    const isJsonContent = /application\/json/.test(
      String(res.get('content-type')),
    )

    const value: { [key in ResponseSegment]: unknown } = {
      body: isJsonContent ? JSON.parse(body) : body,
      headers: res.getHeaders(),
    }

    const schemaBySegment = spec.has(String(res.statusCode))
      ? spec.get(String(res.statusCode))
      : spec.get('default')

    if (!schemaBySegment) {
      next(
        new Error(
          `Validation Schema not found for Response(${res.statusCode})`,
        ),
      )
      return res
    }

    for (const segment of segmentOrder) {
      const schema = schemaBySegment[segment]

      if (!schema) {
        continue
      }

      const result = schema.safeParse(value[segment])

      if (!result.success) {
        next(new ResponseValidationError(result.error, segment))
        return res
      }

      if (segment === 'body') {
        value[segment] = result.data
      }
    }

    return originalSend.apply(res, [
      isJsonContent ? JSON.stringify(value.body) : value.body,
    ])
  }
}
