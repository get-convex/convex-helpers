# Changelog

## 0.1.107

- Zod support: branded object types are now supported (credit: gary-ix)
- Fixes `skipConvexValidation` for zod custom functions to still do zod validation.

## 0.1.106

- Update typedV to match the type of the installed convex validators for v.nullable
- Improves handling of literals() helper to keep the ordering of its members
- Improved Zod 4 handling of circular types, empty returns, and empty function args
- Zod 4 transforms can now be asynchronous

## 0.1.105

- **convex-helpers now supports Zod 4!** (#840)
  - The new methods that support Zod 4 can be found in `convex-helpers/server/zod4`
  - Existing types and methods for Zod 3 support have been moved
    (`convex-helpers/server/zod` → `convex-helpers/server/zod3`)
  - Thanks to @ksinghal and @natedunn for their contributions to this improvement.
- Zod 3 support: fix the return types of `zodOutputToConvex` for objects and unions
  (credit: gari-ix)
- Zod 3 support: improve the type safety of `onSuccess` in custom function builders
- Sessions: If the only argument to a session function is the sessionId,
  allow omitting args in React.

## 0.1.104

- Allows RLS to deny access by default

## 0.1.103

- Parsing validators with optional fields and explicit { field: undefined } works

## 0.1.102

- You can use Zod4 alongside convex-helpers.
  Note: convex-helpers/zod supports zod3 only. Zod4 support is WIP

## 0.1.101

- Improved Zod union type (credit:Firephoenix25)
- Fixes zCustom\* function type inference regression
- Adds a helper function `addFieldsToValidator` which recursively adds fields
  to either a `{ key: v.string() }`, a `v.object(..)`, or `v.union(...` of objects/unions.
- Tightens the types when not using extra args, so it catches typos
- Removes the long-deprecated "output" argument (use `returns` instead)- Improved Zod union type (credit:Firephoenix25)
- Bumps the Convex peer dependency as we rely on compareValues (credit:nicolas)
- Exports types for QueryStream

## 0.1.100

- Custom Functions now can take dynamic parameters for each function
  they define (e.g. each custom query providing a "role" it expects)
- Custom Functions can provide an "onSuccess" callback to do final
  things after the inner function succeeds. Throwing fails it.
- Custom Functions exposes a customCtxAndArgs utility to help with types
- Trigger DB wrapper is now an object, not a class when using
  `.wrapDB()` or `writerWithTriggers` explicitly (credit: front-depiction)
- `convexToZod` now transforms to more specific zod types (credit: Firephoenix25)
- `crud` helper works for tables with top-level unions
- `paginator` works over indexes including `undefined` values.
- `Mod` type is deprecated - renamed to `Customization`

## 0.1.99

- Fixes LoadingMore for custom pagintation

## 0.1.98

- `partial` now supports unions too (including recursive unions).

## 0.1.97

- `partial` from `convex-helpers/validators` now supports either a
  v.object or POJO of validators.

## 0.1.96

- Fix the usePaginatedQuery helper to show LoadingMore when loading
  the last page

## 0.1.95

- Improved CORS support for server-to-server endpoints, along with more
  nuanced handling of Vary headers.
  If you want the server to continue throwing when origins don't match,
  pass `enforceAllowOrigins: true`. By default it will not throw and let
  the browser or other server decide what to do about a conflict.

## 0.1.94

- Fix: Pagination of distinct streams

## 0.1.93

- Changes `usePaginatedQuery` for caching to take a `customPagination`
  option instead of "fixed" vs. "grow" for now. Pass `true` when using
  the `paginator` or `stream` helpers.
- Adds a regular `usePaginatedQuery` to use with `stream` and `paginator`
  helpers that doesn't use the subscription cache helper.

## 0.1.92

- `usePaginatedQuery` has the default `latestPageSize` option of "fixed"
  which has the first (or latest once loadMore is called) page stay a
  fixed size. Today this only affects queries using `paginator` or
  `stream` helpers, and will soon also be able to fix the page size for
  built-in pagination too.
- Fix: update type annotations of imports for tsApiApec.ts.

## 0.1.91

- `usePaginatedQuery` is now available in the cached query helpers.
- With `usePaginatedQuery`, you can pass `endCursorBehavior: "setOnLoadMore"`,
  which allows seamless pagination when using `stream` and`paginator` helpers
  and will allow future deprecation of the too-magical QueryJournal.
- Split pages more eagerly in the custom pagination hooks to reduce bandwidth.
- Fix descending multi-column index pagination for `paginator` and `streams`
  helpers.

## 0.1.90

- Support unions with `parse` and `validate(... { throws: true })`

## 0.1.89

- `parse` validator utility

## 0.1.88

- Support for standard schema
- Allow debugging cors

... older: check git!
