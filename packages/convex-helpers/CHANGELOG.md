# Changelog

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
