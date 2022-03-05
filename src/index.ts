import { Application, Handler, Router } from 'express'
import { OpenAPISpecification, processExpressRouters } from './openapi'
import {
  ExpressOpenAPIPlugin,
  ExpressOpenAPIPluginInternals,
  RegisteredExpressOpenAPIPlugin,
} from './plugins'
import { Stash } from './stash'

export * from './plugins'
export { OpenAPISpecification } from './openapi'

export class ExpressOpenAPI {
  private plugins: RegisteredExpressOpenAPIPlugin[] = []
  private useStringStashKey: boolean
  private specification: OpenAPISpecification

  constructor({
    specification = new OpenAPISpecification(),
    useStringStashKey = false,
  }: {
    specification?: OpenAPISpecification
    /**
     * if you're using a library that dynamically modifies your middlewares
     * and the `populateSpecification` method is not working properly,
     * then set this to `true`
     */
    useStringStashKey?: boolean
  } = {}) {
    this.specification = specification
    this.useStringStashKey = useStringStashKey
  }

  registerPlugin = <
    StashType,
    GetMiddleware extends (...params: any[]) => Handler
  >(
    plugin: ExpressOpenAPIPlugin<StashType, GetMiddleware>
  ): ((...params: Parameters<GetMiddleware>) => ReturnType<GetMiddleware>) => {
    const stashSymbol = Symbol(plugin.name)

    const stashKey = this.useStringStashKey
      ? stashSymbol.toString()
      : stashSymbol

    const internals: ExpressOpenAPIPluginInternals<StashType> = {
      specification: this.specification,
      stash: new Stash<StashType>(stashKey),
    }

    const getMiddleware = (
      ...params: Parameters<GetMiddleware>
    ): ReturnType<GetMiddleware> => {
      return plugin.getMiddleware(internals, ...params)
    }

    const registeredPlugin: RegisteredExpressOpenAPIPlugin = {
      name: plugin.name,
      specification: internals.specification,
      stash: internals.stash,
      processRoute: plugin.processRoute,
    }

    this.plugins.push(registeredPlugin)

    return getMiddleware
  }

  populateSpecification = (
    app: Application | Router,
    basePath?: string
  ): OpenAPISpecification => {
    processExpressRouters(this.specification, app, basePath, this.plugins)

    return this.specification
  }
}
