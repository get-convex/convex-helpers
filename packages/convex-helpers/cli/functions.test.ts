export const FUNCTIONS_JSON = `{
    "url": "https://test-convex-url.convex.cloud",
    "functions": [
      {
        "args": {
          "type": "object",
          "value": {}
        },
        "functionType": "Query",
        "identifier": "messages.js:list",
        "returns": {
          "type": "array",
          "value": {
            "type": "object",
            "value": {
              "_creationTime": {
                "fieldType": {
                  "type": "number"
                },
                "optional": false
              },
              "_id": {
                "fieldType": {
                  "tableName": "messages",
                  "type": "id"
                },
                "optional": false
              },
              "author": {
                "fieldType": {
                  "type": "string"
                },
                "optional": false
              },
              "body": {
                "fieldType": {
                  "type": "string"
                },
                "optional": false
              }
            }
          }
        },
        "visibility": {
          "kind": "public"
        }
      },
      {
        "args": {
          "type": "object",
          "value": {
            "author": {
              "fieldType": {
                "type": "string"
              },
              "optional": false
            },
            "body": {
              "fieldType": {
                "type": "string"
              },
              "optional": false
            }
          }
        },
        "functionType": "Mutation",
        "identifier": "messages.js:send",
        "returns": {
          "type": "null"
        },
        "visibility": {
          "kind": "public"
        }
      },
      {
        "functionType": "HttpAction",
        "method": "POST",
        "path": "/getMessage"
      }
    ]
  }`;

export const JS_API = `
import { type FunctionReference, anyApi } from "convex/server"
import { type GenericId as Id } from "convex/values"

export const api: PublicApiType = anyApi as unknown as PublicApiType;
export const internal: InternalApiType = anyApi as unknown as InternalApiType;

export type PublicApiType = { messages: { list: FunctionReference<"query", "public", Record<string, never>, Array<{ _creationTime: number,
_id: Id<"messages">,
author: string,
body: string, }>>
send: FunctionReference<"mutation", "public", { author: string,
body: string, }, null> } }
export type InternalApiType = {  }
`;

export const OPEN_API_SPEC = `
openapi: 3.0.3
info:
    title: Convex App - OpenAPI 3.0
    version: 0.0.0
servers:
    - url: https://test-convex-url.convex.cloud
security:
  - bearerAuth: []
tags:
    - name: query
      description: Functions that read data
    - name: mutation
      description: Functions that write/update/delete data
    - name: action
      description: Functions that can make calls to external APIs
paths:
  
      /api/run/messages/list:
        post:
          summary: Calls a query at the path messages.js:list
          tags:
            - query
          requestBody:
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/Request_messages.list'
            required: true
          responses:
            '200':
              description: Convex executed your request and returned a result
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/Response_messages.list'
            '400':
              description: Failed operation
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/FailedResponse'
            '500':
              description: Convex Internal Error
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/FailedResponse'
  
  
      /api/run/messages/send:
        post:
          summary: Calls a mutation at the path messages.js:send
          tags:
            - mutation
          requestBody:
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/Request_messages.send'
            required: true
          responses:
            '200':
              description: Convex executed your request and returned a result
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/Response_messages.send'
            '400':
              description: Failed operation
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/FailedResponse'
            '500':
              description: Convex Internal Error
              content:
                application/json:
                  schema:
                    $ref: '#/components/schemas/FailedResponse'
  
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Token of the format "Bearer {token}" for normal authentication and "Convex {token}" for admin tokens.
  schemas:
  
      Request_messages.list:
        type: object
        required:
          - args
        properties:
          args:
            type: object
            
  
      Response_messages.list:
        type: object
        required:
          - status
        properties:
          status:
            type: string
            enum:
              - "success"
              - "error"
          errorMessage:
            type: string
          errorData:
            type: object
          value:
            type: array
            items:
              type: object
              required:
                - _creationTime
                - _id
                - author
                - body
              properties:
                _creationTime:
                  type: number
                _id:
                  type: string
                  description: ID from table "messages"
                author:
                  type: string
                body:
                  type: string
  
  
      Request_messages.send:
        type: object
        required:
          - args
        properties:
          args:
            type: object
            required:
              - author
              - body
            properties:
              author:
                type: string
              body:
                type: string
  
      Response_messages.send:
        type: object
        required:
          - status
        properties:
          status:
            type: string
            enum:
              - "success"
              - "error"
          errorMessage:
            type: string
          errorData:
            type: object
          value:
            type: string
            nullable: true
  
      FailedResponse:
        type: object
        properties: {}
`;

test("setup", () => {});
