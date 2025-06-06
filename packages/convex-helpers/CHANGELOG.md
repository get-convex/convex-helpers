# Changelog

## 0.1.91

- `usePaginatedQuery` is now available in the cached query helpers.
  - With it, you can pass `endCursorBehavior: "setOnLoadMore", which allows seamless
    pagination when using the `stream` and `paginator` helpers and will allow future
    deprecation of the too-magical QueryJournal.
- Split pages more eagerly in the custom pagination hooks to reduce bandwidth.
- Fix descending multi-column index pagination for `paginator` and `streams` helpers.

## 0.1.90

- Support unions with `parse` and `validate(... { throws: true })`

## 0.1.89

- `parse` validator utility

## 0.1.88

- Support for standard schema
- Allow debugging cors

... older: check git!
