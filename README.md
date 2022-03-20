[![GitHub Workflow Status: CI](https://img.shields.io/github/workflow/status/MunifTanjim/express-zod-openapi/CI?label=CI&style=for-the-badge)](https://github.com/MunifTanjim/express-zod-openapi/actions?query=workflow%3ACI)
[![Version](https://img.shields.io/npm/v/express-zod-openapi?style=for-the-badge)](https://npmjs.org/package/express-zod-openapi)
[![Coverage](https://img.shields.io/codecov/c/gh/MunifTanjim/express-zod-openapi?style=for-the-badge)](https://codecov.io/gh/MunifTanjim/express-zod-openapi)
[![License](https://img.shields.io/github/license/MunifTanjim/express-zod-openapi?style=for-the-badge)](https://github.com/MunifTanjim/express-zod-openapi/blob/main/LICENSE)

# Express + Zod + OpenAPI

Express + Zod + OpenAPI

## Installation

```sh
# using yarn:
yarn add express-zod-openapi

# using npm:
npm install --save express-zod-openapi
```

## Usage

```ts
import express from 'express'
import {
  ExpressOpenAPI,
  getSpecificationPlugin,
  RequestValidationError,
  ResponseValidationError,
} from 'express-zod-openapi'
import { z } from 'zod'

const expressOpenApi = new ExpressOpenAPI()

const specificationPlugin = getSpecificationPlugin()

const specification = expressOpenApi.registerPlugin(specificationPlugin)

const app = express()

app.use(express.json())

app.post(
  '/ping',
  specification({
    operationId: 'ping',
    req: {
      query: z.object({
        count: z.preprocess((v: unknown) => {
          const val = Number(v)
          return Number.isNaN(val) ? v : val
        }, z.number().int().describe('number of times ping will pong')),
      }),
      body: z.object({
        type: z.enum(['plastic', 'rubber', 'wood']).default('rubber'),
      }),
    },
    res: {
      200: {
        body: z.object({
          pong: z.number().int(),
        }),
      },
    },
  }),
  (req, res) => {
    const { count } = req.query

    res.status(200).json({
      pong: count,
    })
  }
)

app.use((err, _req, res, next) => {
  if (err instanceof RequestValidationError) {
    res.status(400).json({
      error: {
        message: `Request Validation Error`,
        details: err.validationError.errors.map(({ message, path }) => ({
          message,
          location: path.join('.'),
          locationType: err.segment,
        })),
      },
    })

    return
  }

  if (err instanceof ResponseValidationError) {
    console.error(err)

    res.status(500).json({
      error: {
        message: `Response Validation Error`,
      },
    })

    return
  }

  next(err)
})

const specification = expressOpenApi.populateSpecification(app)
```

## Plugin

You get the following plugins out of the box:

- `SpecificationPlugin`

But that's not the end of it. You can write you own `ExpressOpenAPIPlugin` to perform arbitrary changes to
the OpenAPI Specification for your express routes.

**Plugin Example:**

```ts
import type { Handler } from 'express'
import type { ExpressOpenAPIPlugin } from 'express-zod-openapi'

type GetAuthorizationMiddleware = (permissions: string[]) => Handler

type AuthorizationPlugin = ExpressOpenAPIPlugin<
  string[],
  GetAuthorizationMiddleware
>

export const getAuthorizationPlugin = (): AuthorizationPlugin => {
  const authorizationPlugin: AuthorizationPlugin = {
    name: 'authorization-plugin',

    getMiddleware: (internals, permissions): Handler => {
      const middleware: Handler = async (req, res, next) => {
        // do regular stuffs that you do in your authorization middleware

        /*
        const hasSufficientPermission = await checkUserPermission(
          req.user,
          permissions
        )

        if (!hasSufficientPermission) {
          return res.status(403).json({
            error: {
              message: `Not Authorized`,
            },
          })
        }
        */

        next()
      }

      // this will be available as a parameter to `processRoute`  function
      internals.stash.store(middleware, permissions)

      return middleware
    },

    processRoute: (specification, permissions, { path, method }) => {
      specification.addPathItemOperationSecurityRequirement(path, method, {
        BearerAuth: permissions,
      })
    },
  }

  return authorizationPlugin
}
```

## License

Licensed under the MIT License. Check the [LICENSE](./LICENSE) file for details.
