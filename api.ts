
        import { FunctionReference, anyApi } from "convex/server"
        import { GenericId as Id } from "convex/values"
        
        export type PublicApiType = { messages: { send: FunctionReference<"mutation", "public", { author: string,
body: string, }, any>
list: FunctionReference<"query", "public", any, any> } }
        export type InternalApiType = {  }
        export const api: PublicApiType = anyApi as unknown as PublicApiType;
        export const internal: InternalApiType = anyApi as unknown as InternalApiType;
        