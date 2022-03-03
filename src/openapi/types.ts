import { Router } from 'express'
import { HttpMethod } from '../types'

export const enum StackName {
  QUERY = 'query',
  EXPRESS_INIT = 'expressInit',
  BOUND_DISPATCH = 'bound dispatch',
  ROUTER = 'router',
  MOUNTED_APP = 'mounted_app',
}

interface Key {
  name: string | number
  prefix: string
  suffix: string
  pattern: string
  modifier: string
}

export interface Layer {
  handle: Router | ((...params: any[]) => any)
  params?: Record<string, any>
  path?: string
  keys: Key[]
  regexp: RegExp & { fast_star?: boolean; fast_slash?: boolean }
}

export interface StackLayer extends Layer {
  name: StackName
  route?: Route
}

export interface RouteLayer extends Layer {
  name: string
  method: HttpMethod
}

export interface Route {
  path: string | string[]
  stack: RouteLayer[]
  methods: {
    [method in HttpMethod | '_all']?: boolean
  }
}
