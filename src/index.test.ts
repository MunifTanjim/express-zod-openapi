import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { ExpressOpenAPI } from './index'
import { getSpecificationPlugin } from './plugins'

const preprocessors = {
  numberString: (v: unknown) => {
    const val = Number(v)
    return Number.isNaN(val) ? v : val
  },
}

describe('ExpressOpenAPI', () => {
  describe('constructor', () => {
    test('can create instance without arguments', () => {
      expect(new ExpressOpenAPI()).toBeInstanceOf(ExpressOpenAPI)
    })

    test('can create instance with arguments', () => {
      expect(new ExpressOpenAPI({ useStringStashKey: true })).toBeInstanceOf(
        ExpressOpenAPI
      )
    })
  })

  test('basic request schema generation', () => {
    const expressOpenApi = new ExpressOpenAPI()

    const getSpecificationMiddleware = expressOpenApi.registerPlugin(
      getSpecificationPlugin()
    )

    const app = express()

    app.post(
      '/ping',
      getSpecificationMiddleware({
        operationId: 'ping',
        req: {
          query: z.object({
            count: z.preprocess(
              preprocessors.numberString,
              z
                .number({ description: 'asd' })
                .int()
                .describe('number of times ping will pong')
            ),
          }),
          body: z.object({
            type: z.enum(['plastic', 'rubber', 'wood']).default('rubber'),
          }),
        },
      })
    )

    const specification = expressOpenApi.populateSpecification(app)

    expect(specification.paths).toMatchSnapshot()
  })

  test('basic response schema generation', async () => {
    const expressOpenApi = new ExpressOpenAPI()

    const getSpecificationMiddleware = expressOpenApi.registerPlugin(
      getSpecificationPlugin()
    )

    const app = express()

    app.post(
      '/ping',
      getSpecificationMiddleware({
        operationId: 'ping',
        res: {
          200: {
            headers: z.object({
              'x-count': z.preprocess(
                preprocessors.numberString,
                z.number().int()
              ),
            }),
            body: z.object({
              pong: z.number().int(),
            }),
          },
        },
      }),
      (_req, res) => {
        res.set('x-count', '42')
        res.status(200).json({ pong: 42 })
      }
    )

    const specification = expressOpenApi.populateSpecification(app)

    expect(specification.paths).toMatchSnapshot()

    const response = await request(app).post('/ping')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ pong: 42 })
  })
})
