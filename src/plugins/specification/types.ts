import type {
  Request as ExpressRequest,
  RequestHandler as ExpressRequestHandler,
  Response as ExpressResponse,
} from 'express'
import type { Schema, TypeOf } from 'zod'
import type { RequestSegment, ResponseSegment } from '../../types'

export type SpecificationSchema = {
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
