# convex-helpers

A collection of useful code to complement the official packages.

## Row-level security

See the [Stack post on row-level security](https://stack.convex.dev/row-level-security)

Use the [RowLevelSecurity](./server/rowLevelSecurity.ts) helper to define
`withQueryRLS` and `withMutationRLS` wrappers to add row-level checks for a
server-side function. Any access to `db` inside functions wrapped with these
will check your access rules on read/insert/modify per-document.

## Relationship helpers

See the [Stack post on relationship helpers](https://stack.convex.dev/functional-relationships-helpers)
and the [relationship schema structures post](https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas).

Use the helpers in [relationships.ts](./server/relationships.ts) to traverse database relationships in queries more cleanly.
