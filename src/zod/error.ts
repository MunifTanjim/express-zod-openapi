import type { ZodError } from 'zod'
import type { RequestSegment, ResponseSegment } from '../types'

export class RequestValidationError extends Error {
  segment: RequestSegment
  validationError: ZodError

  constructor(validationError: ZodError, segment: RequestSegment) {
    super(validationError.message)

    this.segment = segment
    this.validationError = validationError
  }
}

export class ResponseValidationError extends Error {
  segment: ResponseSegment
  validationError: ZodError

  constructor(validationError: ZodError, segment: ResponseSegment) {
    super(validationError.message)

    this.segment = segment
    this.validationError = validationError
  }
}
