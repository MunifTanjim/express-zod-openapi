import {
  ComponentsObject,
  ExternalDocumentationObject,
  InfoObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SecurityRequirementObject,
  ServerObject,
  TagObject,
} from 'openapi3-ts'
import { HttpMethod } from '../types'

type ComponentType =
  | 'schemas'
  | 'responses'
  | 'parameters'
  | 'examples'
  | 'requestBodies'
  | 'headers'
  | 'securitySchemes'
  | 'links'
  | 'callbacks'

type ComponentObject<Type extends ComponentType = ComponentType> = NonNullable<
  ComponentsObject[Type]
>[string]

type PathItemObject = {
  summary?: string
  description?: string
  servers?: ServerObject[]
  parameters?: (ParameterObject | ReferenceObject)[]
} & {
  [method in HttpMethod]?: OperationObject
}

type PathsObject = {
  [path: string]: PathItemObject | undefined
}

type OpenAPIObjectSkeleton = {
  openapi: string
  info: InfoObject
  components: Required<Pick<ComponentsObject, ComponentType>>
  paths: PathsObject
  security: SecurityRequirementObject[]
  tags: TagObject[]
  servers: ServerObject[]
  externalDocs?: ExternalDocumentationObject
}

export class OpenAPISpecification {
  private spec: OpenAPIObjectSkeleton

  private static isValidOpenApiVersion(version = ''): boolean {
    const match = /(\d+)\.(\d+).(\d+)/.exec(version)

    if (match) {
      const major = Number(match[1])

      if (major >= 3) {
        return true
      }
    }

    return false
  }

  private assertNonNull<T>(value: T | null, name: string): asserts value is T {
    if (!value) {
      throw new Error(`${name} is not set!`)
    }
  }

  constructor(
    {
      openapi = '3.0.0',
      info = { title: '', version: '' },
      components,
      paths = {},
      security = [],
      tags = [],
      servers = [],
      externalDocs,
    }: OpenAPIObject = {
      openapi: '3.0.0',
      info: { title: '', version: '' },
      paths: {},
    }
  ) {
    this.spec = {
      openapi,
      info,
      components: {
        schemas: {},
        responses: {},
        parameters: {},
        examples: {},
        requestBodies: {},
        headers: {},
        securitySchemes: {},
        links: {},
        callbacks: {},
        ...components,
      },
      paths,
      security,
      tags,
      servers,
      externalDocs,
    }

    this.setOpenApiVersion(openapi)
  }

  get openapi(): OpenAPIObjectSkeleton['openapi'] {
    return this.spec.openapi
  }

  setOpenApiVersion(version: string): this {
    if (!OpenAPISpecification.isValidOpenApiVersion(version)) {
      throw new Error(
        `Invalid OpenAPI version: ${version}, expected format: 3.y.z`
      )
    }

    this.spec.openapi = version

    return this
  }

  get info(): OpenAPIObjectSkeleton['info'] {
    return this.spec.info
  }

  setInfo(info: InfoObject): this {
    this.spec.info = info
    return this
  }

  get components(): OpenAPIObjectSkeleton['components'] {
    return this.spec.components
  }

  setComponent<Type extends ComponentType>(
    componentType: Type,
    name: string,
    component: ComponentObject<Type>
  ): this {
    this.spec.components[componentType] = {
      ...this.spec.components[componentType],
      [name]: component,
    }
    return this
  }

  get paths(): OpenAPIObjectSkeleton['paths'] {
    return this.spec.paths
  }

  getPathItem(path: string): PathItemObject | null {
    return this.paths[path] ?? null
  }

  setPathItem(path: string, pathItem: PathItemObject): this {
    this.spec.paths[path] = pathItem
    return this
  }

  addPathItemParameter(
    path: string,
    parameter: ParameterObject | ReferenceObject
  ): this {
    const pathItem = this.getPathItem(path)

    this.assertNonNull(pathItem, `paths[${path}] pathItem`)

    if (!pathItem.parameters) {
      pathItem.parameters = []
    }

    pathItem.parameters.push(parameter)

    this.spec.paths[path] = pathItem

    return this
  }

  addPathItemServer(path: string, server: ServerObject): this {
    const pathItem = this.getPathItem(path)

    this.assertNonNull(pathItem, `paths[${path}] pathItem`)

    if (!pathItem.servers) {
      pathItem.servers = []
    }

    pathItem.servers.push(server)

    this.spec.paths[path] = pathItem

    return this
  }

  getPathItemOperation(
    path: string,
    method: HttpMethod
  ): OperationObject | null {
    return this.paths[path]?.[method] ?? null
  }

  setPathItemOperation(
    path: string,
    method: HttpMethod,
    operation: OperationObject
  ): this {
    const pathItem = this.getPathItem(path)

    this.assertNonNull(pathItem, `paths[${path}] pathItem`)

    this.spec.paths[path] = {
      ...pathItem,
      [method]: operation,
    }

    return this
  }

  setPathItemOperationRequestBody(
    path: string,
    method: HttpMethod,
    requestBody: RequestBodyObject | ReferenceObject
  ): this {
    const operation = this.getPathItemOperation(path, method)

    this.assertNonNull(operation, `paths[${path}][${method}] operation`)

    operation.requestBody = requestBody

    return this
  }

  getPathItemOperationResponse(
    path: string,
    method: HttpMethod,
    httpStatusCode: number | 'default'
  ): ResponseObject | ReferenceObject | null {
    return this.paths[path]?.[method]?.responses?.[httpStatusCode] ?? null
  }

  setPathItemOperationResponse(
    path: string,
    method: HttpMethod,
    httpStatusCode: number | 'default',
    response: ResponseObject | ReferenceObject
  ): this {
    const operation = this.getPathItemOperation(path, method)

    this.assertNonNull(operation, `paths[${path}][${method}] operation`)

    operation.responses[httpStatusCode] = response

    return this.setPathItemOperation(path, method, operation)
  }

  addPathItemOperationTag(path: string, method: HttpMethod, tag: string): this {
    const operation = this.getPathItemOperation(path, method)

    this.assertNonNull(operation, `paths[${path}][${method}] operation`)

    operation.tags = operation.tags ? operation.tags.concat(tag) : [tag]

    this.setPathItemOperation(path, method, operation)

    return this
  }

  addPathItemOperationParameter(
    path: string,
    method: HttpMethod,
    parameter: ParameterObject | ReferenceObject
  ): this {
    const operation = this.getPathItemOperation(path, method)

    this.assertNonNull(operation, `paths[${path}][${method}] operation`)

    operation.parameters = operation.parameters
      ? operation.parameters.concat(parameter)
      : [parameter]

    this.setPathItemOperation(path, method, operation)

    return this
  }

  addPathItemOperationSecurityRequirement(
    path: string,
    method: HttpMethod,
    securityRequirement: SecurityRequirementObject
  ): this {
    const operation = this.getPathItemOperation(path, method)

    this.assertNonNull(operation, `paths[${path}][${method}] operation`)

    operation.security = operation.security
      ? operation.security.concat(securityRequirement)
      : [securityRequirement]

    this.setPathItemOperation(path, method, operation)

    return this
  }

  addPathItemOperationServer(
    path: string,
    method: HttpMethod,
    server: ServerObject
  ): this {
    const operation = this.getPathItemOperation(path, method)

    this.assertNonNull(operation, `paths[${path}][${method}] operation`)

    operation.servers = operation.servers
      ? operation.servers.concat(server)
      : [server]

    this.setPathItemOperation(path, method, operation)

    return this
  }

  get security(): OpenAPIObjectSkeleton['security'] {
    return this.spec.security
  }

  addSecurity(security: SecurityRequirementObject): this {
    this.spec.security.push(security)
    return this
  }

  get tags(): OpenAPIObjectSkeleton['tags'] {
    return this.spec.tags
  }

  addTag(tag: TagObject): this {
    this.spec.tags.push(tag)
    return this
  }

  get servers(): OpenAPIObjectSkeleton['servers'] {
    return this.spec.servers
  }

  addServer(server: ServerObject): this {
    this.spec.servers.push(server)
    return this
  }

  get externalDocs(): OpenAPIObjectSkeleton['externalDocs'] {
    return this.spec.externalDocs
  }

  setExternalDocs(
    externalDocs: ExternalDocumentationObject
  ): OpenAPISpecification {
    this.spec.externalDocs = externalDocs
    return this
  }

  toJSON(): OpenAPIObject {
    return this.spec
  }

  toString(
    replacer?: Parameters<JSON['stringify']>[1],
    space?: Parameters<JSON['stringify']>[2]
  ): string {
    return JSON.stringify(this.spec, replacer, space)
  }
}
