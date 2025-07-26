# Changelog

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
