import express, { Handler } from 'express'
import { OpenAPIObject } from 'openapi3-ts'
import { processExpressRouters } from './express'
import { OpenAPISpecification } from './index'
import { RegisteredExpressOpenAPIPlugin } from '../plugins/types'
import { Stash } from '../stash'

describe('processExpressRouters', () => {
  describe('detects paths with methods', () => {
    const getPathMethods = (
      specification: OpenAPIObject,
    ): Record<string, string[]> => {
      return Object.keys(specification.paths).reduce<Record<string, string[]>>(
        (result, path) => {
          result[path] = Object.keys(specification.paths[path])
          return result
        },
        {},
      )
    }

    let spec: OpenAPISpecification
    const middleware: Handler = (): void => {
      return
    }

    beforeEach(() => {
      spec = new OpenAPISpecification()
    })

    test('app', () => {
      const app = express()
      app.post('/', middleware)
      app.route('/:id').get(middleware).put(middleware)
      app.delete('/:id', middleware)

      processExpressRouters(spec, app, '', [])
      const specification = spec.toJSON()
      const pathMethods = getPathMethods(specification)

      expect(pathMethods).toMatchInlineSnapshot(`
        Object {
          "/": Array [
            "post",
          ],
          "/{id}": Array [
            "get",
            "put",
            "delete",
          ],
        }
      `)
    })

    test('router', () => {
      const router = express.Router()
      router.post('/', middleware)
      router.route('/:id').get(middleware).put(middleware)
      router.delete('/:id', middleware)

      processExpressRouters(spec, router, '', [])
      const specification = spec.toJSON()
      const pathMethods = getPathMethods(specification)

      expect(pathMethods).toMatchInlineSnapshot(`
        Object {
          "/": Array [
            "post",
          ],
          "/{id}": Array [
            "get",
            "put",
            "delete",
          ],
        }
      `)
    })

    test('app + router', () => {
      const app = express()
      app.post('/', middleware)
      app.route('/:id').get(middleware).put(middleware)
      app.delete('/:id', middleware)

      const router = express.Router()
      router.post('/', middleware)
      router.route('/:key').get(middleware).put(middleware)
      router.delete('/:key', middleware)

      app.use('/router', router)

      processExpressRouters(spec, app, '', [])
      const specification = spec.toJSON()
      const pathMethods = getPathMethods(specification)

      expect(pathMethods).toMatchInlineSnapshot(`
        Object {
          "/": Array [
            "post",
          ],
          "/router": Array [
            "post",
          ],
          "/router/{key}": Array [
            "get",
            "put",
            "delete",
          ],
          "/{id}": Array [
            "get",
            "put",
            "delete",
          ],
        }
      `)
    })

    test('app + router + subRouter', () => {
      const app = express()
      app.post('/', middleware)
      app.route('/:id').get(middleware).put(middleware)

      const router = express.Router()
      router.post('/', middleware)
      router.route('/:key').get(middleware).put(middleware)

      const subRouter = express.Router()
      subRouter.post('/', middleware)
      subRouter.route('/:name').get(middleware).put(middleware)

      router.use('/sub-router', subRouter)

      app.use('/router', router)

      processExpressRouters(spec, app, '', [])
      const specification = spec.toJSON()
      const pathMethods = getPathMethods(specification)

      expect(pathMethods).toMatchInlineSnapshot(`
        Object {
          "/": Array [
            "post",
          ],
          "/router": Array [
            "post",
          ],
          "/router/sub-router": Array [
            "post",
          ],
          "/router/sub-router/{name}": Array [
            "get",
            "put",
          ],
          "/router/{key}": Array [
            "get",
            "put",
          ],
          "/{id}": Array [
            "get",
            "put",
          ],
        }
      `)
    })
  })

  test('handles plugins as expected', () => {
    const specification = new OpenAPISpecification()

    const registeredPlugin: RegisteredExpressOpenAPIPlugin = {
      name: 'test-plugin',
      specification,
      stash: new Stash<string>(Symbol('test-plugin')),
      processRoute: jest.fn(),
    }

    const middleware: Handler = (): void => {
      return
    }

    const pluginMiddleware: Handler = (): void => {
      return
    }

    const app = express()
    app.post('/', middleware, pluginMiddleware)
    app.route('/:id').get(middleware, pluginMiddleware).put(middleware)
    app.delete('/:id', middleware)

    processExpressRouters(specification, app, '', [registeredPlugin])

    expect(registeredPlugin.processRoute).not.toBeCalled()

    registeredPlugin.stash.store(pluginMiddleware, 'forty-two')

    processExpressRouters(specification, app, '', [registeredPlugin])

    expect(registeredPlugin.processRoute).toBeCalledTimes(2)
    expect(registeredPlugin.processRoute).toHaveBeenNthCalledWith(
      1,
      specification,
      'forty-two',
      { method: 'post', path: '/' },
    )
    expect(registeredPlugin.processRoute).toHaveBeenNthCalledWith(
      2,
      specification,
      'forty-two',
      { method: 'get', path: '/{id}' },
    )
  })
})
