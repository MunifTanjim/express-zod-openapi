export type HttpMethod =
  | 'delete'
  | 'head'
  | 'get'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'trace'

export type RequestSegment =
  | 'body'
  | 'cookies'
  | 'headers'
  | 'params'
  | 'query'
  | 'signedCookies'

export type ResponseSegment = 'body' | 'headers'
