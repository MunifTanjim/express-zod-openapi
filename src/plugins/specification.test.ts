import express, { Application, ErrorRequestHandler, Handler } from 'express'
import request from 'supertest'
import { z } from 'zod'
import {
  GetSpecificationMiddleware,
  getSpecificationPlugin,
  RequestValidationError,
  ResponseValidationError,
} from '.'
import { ExpressOpenAPI } from '../index'

const preprocessors = {
  numberString: (v: unknown) => {
    const val = Number(v)
    return Number.isNaN(val) ? v : val
  },
}

describe('getJoiRequestValidatorPlugin', () => {
  test('returns plugin', () => {
    const plugin = getSpecificationPlugin()
    expect(plugin.name).toMatchInlineSnapshot(`"zod-openapi-spec"`)
    expect(plugin.getMiddleware).toBeDefined()
    expect(plugin.processRoute).toBeDefined()
  })

  describe('request validation', () => {
    let spec: GetSpecificationMiddleware
    let app: Application

    const handler: Handler = (_req, res) => {
      res.status(200).json({
        pong: 42,
      })
    }

    const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
      if (err instanceof RequestValidationError) {
        res.status(400).json({
          error: {
            message: err.message,
            segment: err.segment,
            // details: err.validationError.details.map(
            //   ({ message, path, type }) => ({ message, path, type })
            // ),
          },
        })

        return
      }

      res.status(500).json({
        error: {
          message: 'Server Error',
        },
      })
    }

    describe('segment validation', () => {
      beforeEach(() => {
        const expressOpenApi = new ExpressOpenAPI()

        app = express()
        app.use(express.json())

        const validatorPlugin = getSpecificationPlugin({
          res: {
            skipValidation: true,
          },
        })

        spec = expressOpenApi.registerPlugin(validatorPlugin)
      })

      test('validates headers', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            req: {
              headers: z.object({
                authorization: z.string().regex(/^Bearer .+$/),
              }),
            },
          }),
          handler
        )

        app.use(errorHandler)

        const invalidResponse1 = await request(app)
          .post('/ping')
          .set('authorization', `JWT 42`)
        expect(invalidResponse1.status).toBe(400)
        expect(invalidResponse1.body).toMatchSnapshot()

        const validResponse1 = await request(app)
          .post('/ping')
          .set('authorization', `Bearer 42`)
        expect(validResponse1.status).toBe(200)
      })

      test('validates params', async () => {
        app.post(
          '/ping/:id',
          spec({
            operationId: 'ping',
            req: {
              params: z.object({
                id: z.preprocess(preprocessors.numberString, z.number().int()),
              }),
            },
          }),
          handler
        )

        app.use(errorHandler)

        const invalidResponse1 = await request(app).post('/ping/forty-two')
        expect(invalidResponse1.status).toBe(400)
        expect(invalidResponse1.body).toMatchSnapshot()

        const validResponse1 = await request(app).post('/ping/42')
        expect(validResponse1.status).toBe(200)
      })

      test('validates query', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            req: {
              query: z.object({
                count: z.preprocess(
                  preprocessors.numberString,
                  z.number().int()
                ),
              }),
            },
          }),
          handler
        )

        app.use(errorHandler)

        const invalidResponse1 = await request(app).post('/ping')
        expect(invalidResponse1.status).toBe(400)
        expect(invalidResponse1.body).toMatchSnapshot()

        const invalidResponse2 = await request(app).post(
          '/ping?count=forty-two'
        )
        expect(invalidResponse2.status).toBe(400)
        expect(invalidResponse2.body).toMatchSnapshot()

        const validResponse1 = await request(app).post('/ping?count=42')
        expect(validResponse1.status).toBe(200)
      })

      test('validates body', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            req: {
              body: z.object({
                type: z.enum(['plastic', 'rubber', 'wood']).default('rubber'),
              }),
            },
          }),
          handler
        )

        app.use(errorHandler)

        const invalidResponse1 = await request(app)
          .post('/ping')
          .send({ type: 'paper' })
        expect(invalidResponse1.status).toBe(400)
        expect(invalidResponse1.body).toMatchSnapshot()

        const validResponse1 = await request(app).post('/ping')
        expect(validResponse1.status).toBe(200)

        const validResponse2 = await request(app)
          .post('/ping')
          .send({ type: 'wood' })
        expect(validResponse2.status).toBe(200)
      })
    })

    describe('value coercion', () => {
      const mockFn = jest.fn()

      beforeEach(() => {
        const expressOpenApi = new ExpressOpenAPI()

        app = express()
        app.use(express.json())

        const validatorPlugin = getSpecificationPlugin({
          res: {
            skipValidation: true,
          },
        })

        spec = expressOpenApi.registerPlugin(validatorPlugin)

        mockFn.mockReset()
      })

      test('coerces w/o option debug/warnings', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            req: {
              body: z.object({
                count: z.preprocess(
                  preprocessors.numberString,
                  z.number().int()
                ),
              }),
            },
          }),
          (req, _res, next) => {
            mockFn(req.body)
            next()
          },
          handler
        )

        app.use(errorHandler)

        const response = await request(app).post('/ping').send({ count: '42' })
        expect(response.status).toBe(200)
        expect(mockFn.mock.calls).toMatchInlineSnapshot(`
            Array [
              Array [
                Object {
                  "count": 42,
                },
              ],
            ]
          `)
      })
    })

    describe('options: segmentOrder', () => {
      test('(default) validates query before body', async () => {
        const expressOpenApi = new ExpressOpenAPI()

        app = express()
        app.use(express.json())

        const validatorPlugin = getSpecificationPlugin({
          res: {
            skipValidation: true,
          },
        })

        spec = expressOpenApi.registerPlugin(validatorPlugin)

        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            req: {
              body: z.object({
                type: z.enum(['plastic', 'rubber', 'wood']).default('rubber'),
              }),
              query: z.object({
                count: z.preprocess(
                  preprocessors.numberString,
                  z.number().int()
                ),
              }),
            },
          }),
          handler
        )

        app.use(errorHandler)

        const invalidResponse1 = await request(app)
          .post('/ping')
          .send({ type: 'paper' })
        expect(invalidResponse1.status).toBe(400)
        expect(invalidResponse1.body).toMatchSnapshot()

        const invalidResponse2 = await request(app)
          .post('/ping?count=42')
          .send({ type: 'paper' })
        expect(invalidResponse2.status).toBe(400)
        expect(invalidResponse2.body).toMatchSnapshot()

        const validResponse1 = await request(app)
          .post('/ping?count=42')
          .send({ type: 'wood' })
        expect(validResponse1.status).toBe(200)
      })

      test('(custom) validates body before query', async () => {
        const expressOpenApi = new ExpressOpenAPI()

        app = express()
        app.use(express.json())

        const validatorPlugin = getSpecificationPlugin({
          res: {
            skipValidation: true,
          },
          req: {
            segmentOrder: ['body', 'query'],
          },
        })

        spec = expressOpenApi.registerPlugin(validatorPlugin)

        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            req: {
              body: z.object({
                type: z.enum(['plastic', 'rubber', 'wood']).default('rubber'),
              }),
              query: z.object({
                count: z.preprocess(
                  preprocessors.numberString,
                  z.number().int()
                ),
              }),
            },
          }),
          handler
        )

        app.use(errorHandler)

        const invalidResponse1 = await request(app)
          .post('/ping')
          .send({ type: 'paper' })
        expect(invalidResponse1.status).toBe(400)
        expect(invalidResponse1.body).toMatchSnapshot()

        const invalidResponse2 = await request(app)
          .post('/ping')
          .send({ type: 'wood' })
        expect(invalidResponse2.status).toBe(400)
        expect(invalidResponse2.body).toMatchSnapshot()

        const validResponse1 = await request(app)
          .post('/ping?count=42')
          .send({ type: 'wood' })
        expect(validResponse1.status).toBe(200)
      })
    })
  })

  describe('response validation', () => {
    let spec: GetSpecificationMiddleware
    let app: Application

    const errorHandler = jest.fn((err, _req, res, _next) => {
      if (err instanceof ResponseValidationError) {
        res.status(500).json({
          error: {
            message: err.message,
            segment: err.segment,
            // details: err.validationError.details.map(
            //   ({ message, path, type }) => ({ message, path, type })
            // ),
          },
        })

        return
      }

      res.status(500).json({
        error: {
          message: 'Server Error',
        },
      })
    })

    describe('segment validation', () => {
      beforeEach(() => {
        const expressOpenApi = new ExpressOpenAPI()

        app = express()
        app.use(express.json())

        const validatorPlugin = getSpecificationPlugin({
          req: {
            skipValidation: true,
          },
        })

        spec = expressOpenApi.registerPlugin(validatorPlugin)
      })

      test('validates headers', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            res: {
              200: {
                headers: z.object({
                  'x-count': z.preprocess(
                    preprocessors.numberString,
                    z.number().int()
                  ),
                }),
              },
              default: {},
            },
          }),
          (req, res) => {
            const pass = Number(req.query.pass)

            if (pass) {
              res.set('x-count', '42')
            }

            res.status(200).json({
              pong: 42,
            })
          }
        )

        app.use(errorHandler)

        const responseFail = await request(app).post('/ping?pass=0')

        expect(responseFail.status).toBe(500)
        expect(responseFail.body).toMatchSnapshot()

        const responsePass = await request(app).post('/ping?pass=1')

        expect(responsePass.status).toBe(200)
      })

      test('validates body', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            res: {
              200: {
                body: z.object({
                  pong: z.number().int(),
                }),
              },
              default: {},
            },
          }),
          (req, res) => {
            const pass = Number(req.query.pass)

            res.status(200).json({
              pong: pass ? 42 : 'forty-two',
            })
          }
        )

        app.use(errorHandler)

        const responseFail = await request(app).post('/ping?pass=0')

        expect(responseFail.status).toBe(500)
        expect(responseFail.body).toMatchSnapshot()

        const responsePass = await request(app).post('/ping?pass=1')

        expect(responsePass.status).toBe(200)
      })

      test('works for res.send inside callback', async () => {
        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            res: {
              200: {
                body: z.object({
                  pong: z.number().int(),
                }),
              },
              default: {},
            },
          }),
          (req, res) => {
            const pass = Number(req.query.pass)

            setTimeout(() => {
              res.status(200).json({
                pong: pass ? 42 : 'forty-two',
              })
            }, 0)
          }
        )

        app.use(errorHandler)

        const responseFail = await request(app).post('/ping?pass=0')

        expect(responseFail.status).toBe(500)
        expect(responseFail.body).toMatchSnapshot()

        const responsePass = await request(app).post('/ping?pass=1')

        expect(responsePass.status).toBe(200)
      })
    })

    describe('options: res.skipValidation', () => {
      test('works as expected', async () => {
        const expressOpenApi = new ExpressOpenAPI()

        app = express()
        app.use(express.json())

        const joiResponseValidatorPlugin = getSpecificationPlugin({
          req: {
            skipValidation: true,
          },
          res: {
            skipValidation: true,
          },
        })

        spec = expressOpenApi.registerPlugin(joiResponseValidatorPlugin)

        app.post(
          '/ping',
          spec({
            operationId: 'ping',
            res: {
              200: {
                headers: z.object({
                  'x-count': z.number().int(),
                }),
              },
              default: {},
            },
          }),
          (req, res) => {
            const pass = Number(req.query.pass)

            if (pass) {
              res.set('x-count', '42')
            }

            res.status(200).json({
              pong: 42,
            })
          }
        )

        app.use(errorHandler)

        const response = await request(app).post('/ping?pass=0')

        expect(response.status).toBe(200)
      })
    })
  })
})
