import { ReferenceObject } from 'openapi3-ts'

export const isReferenceObject = (
  referenceObject: { [key: string]: unknown } | ReferenceObject,
): referenceObject is ReferenceObject => {
  return '$ref' in referenceObject
}
