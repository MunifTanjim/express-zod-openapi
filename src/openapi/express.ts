import { Application, Router } from 'express'
import { RegisteredExpressOpenAPIPlugin } from '../plugins/types'
import { HttpMethod } from '../types'
import { OpenAPISpecification } from './index'
import { Layer, Route, StackLayer, StackName } from './types'

const regexPattern = {
  param: /\(\?:\(\[\^\\\/]\+\?\)\)/,
  path: /^\^\\\/(?:(:?[\w\\.-]*(?:\\\/:?[\w\\.-]*)*)|(\(\?:\(\[\^\\\/]\+\?\)\)))\\/,
  rootPath: /^\^\\\/\?\(\?=\\\/\|\$\)$/,
}

const getPathString = (
  pathRegex: RegExp,
  keys: Layer['keys']
): string | null => {
  const pathRegexpSource = pathRegex.source

  let regexString = pathRegexpSource

  let regexStringExecArray = regexPattern.path.exec(regexString)

  let paramIndex = 0
  while (regexPattern.param.test(regexString)) {
    const param = `:${keys[paramIndex].name}`

    regexString = regexString.replace(regexPattern.param, param)

    paramIndex++
  }

  if (regexString !== pathRegexpSource) {
    regexStringExecArray = regexPattern.path.exec(regexString)
  }

  const pathString = regexStringExecArray?.[1].replace(/\\\//g, '/')

  return pathString ?? null
}

const processRoute = (
  spec: OpenAPISpecification,
  route: Route,
  basePath = '',
  plugins: RegisteredExpressOpenAPIPlugin[]
): void => {
  const routePaths = Array.isArray(route.path) ? route.path : [route.path]

  routePaths.forEach((routePath) => {
    const path = `${
      basePath ? `${basePath}${routePath === '/' ? '' : routePath}` : routePath
    }`.replace(/:([a-zA-Z0-9_]+)/g, '{$1}')

    const methods = Object.keys(route.methods).filter(
      (method): method is HttpMethod => method !== '_all'
    )

    if (!spec.paths[path]) {
      spec.setPathItem(path, {})
    }

    for (const method of methods) {
      spec.setPathItemOperation(path, method, {
        responses: {
          default: {
            description: '',
          },
        },
      })

      for (const plugin of plugins) {
        const stashedValue = plugin.stash.find(route, method)
        if (stashedValue) {
          plugin.processRoute(plugin.specification, stashedValue, {
            path,
            method,
          })
        }
      }
    }
  })
}

export const processExpressRouters = (
  spec: OpenAPISpecification,
  app: Application | Router,
  basePath = '',
  plugins: RegisteredExpressOpenAPIPlugin[]
): void => {
  const stack: StackLayer[] = app.stack ?? (app as Application)._router?.stack

  if (!stack) {
    spec.setPathItem(basePath, {})

    return
  }

  for (const layer of stack) {
    // terminal route
    if (layer.route) {
      processRoute(spec, layer.route, basePath, plugins)

      continue
    }

    if (
      layer.name !== StackName.ROUTER &&
      layer.name !== StackName.BOUND_DISPATCH &&
      layer.name !== StackName.MOUNTED_APP
    ) {
      continue
    }

    if (regexPattern.path.test(layer.regexp.source)) {
      const parsedPath = getPathString(layer.regexp, layer.keys)

      if (parsedPath) {
        processExpressRouters(
          spec,
          layer.handle as Router,
          basePath + '/' + parsedPath,
          plugins
        )
      }

      continue
    }

    if (
      !layer.path &&
      layer.regexp &&
      !regexPattern.rootPath.test(layer.regexp.source)
    ) {
      const regexPath = ' RegExp(' + layer.regexp + ') '

      processExpressRouters(
        spec,
        layer.handle as Router,
        basePath + '/' + regexPath,
        plugins
      )

      continue
    }

    processExpressRouters(spec, layer.handle as Router, basePath, plugins)
  }
}
