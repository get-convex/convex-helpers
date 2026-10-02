import { expectTypeOf, test } from "vitest";
import type { ConvexClient } from "convex/browser";
import {
  useQueries as useQueriesCore,
  useQuery as useQueryCore,
  usePaginatedQuery as usePaginatedQueryCore,
} from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReference_future,
  GenericActionCtx,
  GenericDataModel,
  PaginationOptions,
  PaginationResult,
  Scheduler,
} from "convex/server";
import { withArgs } from "./browser.js";
import {
  makeUseQueryWithStatus,
  useQuery,
  usePaginatedQuery,
} from "./react.js";
import {
  useQueries as useCachedQueries,
  useQuery as useCachedQuery,
  usePaginatedQuery as useCachedPaginatedQuery,
} from "./react/cache/hooks.js";
import {
  ConvexReactSessionClient,
  useSessionQuery,
  useSessionMutation,
  useSessionAction,
  useSessionPaginatedQuery,
} from "./react/sessions.js";
import { runSessionFunctions, type SessionId } from "./server/sessions.js";
import {
  startMigration,
  startMigrationsSerially,
  getStatus,
  cancelMigration,
} from "./server/migrations.js";
import { makeActionRetrier } from "./server/retries.js";
import type { ConvexTestingHelper } from "./testing.js";

type Result = { value: string };
type Query = FunctionReference_future<
  "query",
  "public",
  { id: string },
  Result
>;
type Mutation = FunctionReference_future<
  "mutation",
  "public",
  { id: string },
  Result
>;
type Action = FunctionReference_future<
  "action",
  "public",
  { id: string },
  Result
>;
type EmptyQuery = FunctionReference_future<
  "query",
  "public",
  Record<string, never>,
  Result
>;

test("query hooks match Convex 1.46 and compose with cached useQueries", () => {
  expectTypeOf(useCachedQueries).toExtend<typeof useQueriesCore>();
  expectTypeOf(useCachedQuery).toExtend<typeof useQueryCore>();
  const useCachedQueryWithStatus = makeUseQueryWithStatus(useCachedQueries);
  expectTypeOf(useCachedQueryWithStatus).toEqualTypeOf<typeof useQuery>();

  // These callbacks are typechecked, but not run: hooks need a React render.
  expectTypeOf((query: Query, empty: EmptyQuery, mutation: Mutation) => {
    const result = useCachedQuery(query, { id: "one" });
    expectTypeOf(result).toEqualTypeOf<Result | undefined>();
    expectTypeOf(useCachedQuery(empty)).toEqualTypeOf<Result | undefined>();
    useCachedQuery(query, "skip");
    useCachedQuery(empty, "skip");
    // @ts-expect-error Required query arguments cannot be omitted.
    useCachedQuery(query);
    // @ts-expect-error Argument types are preserved.
    useCachedQuery(query, { id: 1 });
    // @ts-expect-error Mutation references are not query references.
    useCachedQuery(mutation, { id: "one" });
    // @ts-expect-error Empty queries reject extra arguments.
    useCachedQuery(empty, { id: "one" });

    useCachedQueries({ first: { query, args: { id: "one" } } });
    const status = useCachedQueryWithStatus(query, { id: "one" });
    if (status.isSuccess) {
      expectTypeOf(status.data).toEqualTypeOf<Result>();
    }
    expectTypeOf(useQuery(empty).data).toEqualTypeOf<Result | undefined>();
    useQuery(query, "skip");
    // @ts-expect-error Status queries also require their arguments.
    useQuery(query);
    // @ts-expect-error Status queries retain argument checking.
    useCachedQueryWithStatus(query, { id: 1 });
  }).toBeFunction();
});

test("paginated hooks preserve the SDK's reference and result signatures", () => {
  // Convex 1.46's paginated hooks still take a plain FunctionReference.
  expectTypeOf(usePaginatedQuery).toExtend<typeof usePaginatedQueryCore>();
  expectTypeOf(useCachedPaginatedQuery).toExtend<
    typeof usePaginatedQueryCore
  >();
  type PaginatedQuery = FunctionReference<
    "query",
    "public",
    { channel: string; paginationOpts: PaginationOptions },
    PaginationResult<Result>
  >;
  type SessionPaginatedQuery = FunctionReference<
    "query",
    "public",
    {
      sessionId: SessionId;
      channel: string;
      paginationOpts: PaginationOptions;
    },
    PaginationResult<Result>
  >;
  expectTypeOf((query: PaginatedQuery, sessionQuery: SessionPaginatedQuery) => {
    expectTypeOf(
      usePaginatedQuery(query, { channel: "one" }, { initialNumItems: 5 })
        .results,
    ).toEqualTypeOf<Result[]>();
    expectTypeOf(
      useCachedPaginatedQuery(query, { channel: "one" }, { initialNumItems: 5 })
        .results,
    ).toEqualTypeOf<Result[]>();
    expectTypeOf(
      useSessionPaginatedQuery(
        sessionQuery,
        { channel: "one" },
        { initialNumItems: 5 },
      )?.results,
    ).toEqualTypeOf<Result[] | undefined>();
    usePaginatedQuery(query, "skip", { initialNumItems: 5 });
    useCachedPaginatedQuery(query, "skip", { initialNumItems: 5 });
    // @ts-expect-error Non-pagination arguments remain required.
    usePaginatedQuery(query, {}, { initialNumItems: 5 });
    // @ts-expect-error Non-pagination argument types are preserved.
    useCachedPaginatedQuery(query, { channel: 1 }, { initialNumItems: 5 });
  }).toBeFunction();
});

test("client wrappers preserve future reference arguments and results", () => {
  type InjectedQuery = FunctionReference_future<
    "query",
    "public",
    { injected: string; id: string },
    Result
  >;
  type InjectedMutation = FunctionReference_future<
    "mutation",
    "public",
    { injected: string; id: string },
    Result
  >;
  type InjectedAction = FunctionReference_future<
    "action",
    "public",
    { injected: string; id: string },
    Result
  >;
  type OnlyInjected = FunctionReference_future<
    "query",
    "public",
    { injected: string },
    Result
  >;
  expectTypeOf(
    (
      client: ConvexClient,
      query: InjectedQuery,
      mutation: InjectedMutation,
      action: InjectedAction,
      onlyInjected: OnlyInjected,
    ) => {
      const injected = withArgs(client, { injected: "value" });
      expectTypeOf(injected.query(query, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(injected.mutation(mutation, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(injected.action(action, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(injected.query(onlyInjected)).toEqualTypeOf<
        Promise<Result>
      >();
      // @ts-expect-error Non-injected arguments remain required.
      void injected.query(query);
      // @ts-expect-error Non-injected argument types are preserved.
      void injected.mutation(mutation, { id: 1 });
      // @ts-expect-error Function kinds are preserved.
      void injected.action(mutation, { id: "one" });
    },
  ).toBeFunction();
  expectTypeOf(
    (
      helper: ConvexTestingHelper,
      query: Query,
      mutation: Mutation,
      action: Action,
    ) => {
      expectTypeOf(helper.query(query, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(helper.mutation(mutation, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(helper.action(action, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      // @ts-expect-error Argument types are preserved by testing helpers.
      void helper.query(query, { id: 1 });
    },
  ).toBeFunction();
});

test("session wrappers accept future references without losing injected argument types", () => {
  type SessionQuery = FunctionReference_future<
    "query",
    "public",
    { sessionId: SessionId | null; id: string },
    Result
  >;
  type SessionMutation = FunctionReference_future<
    "mutation",
    "public",
    { sessionId: SessionId; id: string },
    Result
  >;
  type SessionAction = FunctionReference_future<
    "action",
    "public",
    { sessionId: SessionId; id: string },
    Result
  >;
  type OnlySession = FunctionReference_future<
    "query",
    "public",
    { sessionId: SessionId },
    Result
  >;
  type OptionalSessionQuery = FunctionReference_future<
    "query",
    "public",
    { sessionId: SessionId; id?: string },
    Result
  >;
  expectTypeOf(
    (
      query: SessionQuery,
      mutation: SessionMutation,
      action: SessionAction,
      onlySession: OnlySession,
      optional: OptionalSessionQuery,
      client: ConvexReactSessionClient,
      ctx: GenericActionCtx<GenericDataModel>,
      sessionId: SessionId,
    ) => {
      expectTypeOf(useSessionQuery(query, { id: "one" })).toEqualTypeOf<
        Result | undefined
      >();
      expectTypeOf(useSessionQuery(onlySession)).toEqualTypeOf<
        Result | undefined
      >();
      expectTypeOf(useSessionQuery(optional)).toEqualTypeOf<
        Result | undefined
      >();
      useSessionQuery(query, "skip");
      expectTypeOf(useSessionMutation(mutation)({ id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(useSessionAction(action)({ id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      useSessionMutation(mutation).withOptimisticUpdate((_store, args) => {
        expectTypeOf(args).toEqualTypeOf<{
          sessionId: SessionId;
          id: string;
        }>();
      });
      expectTypeOf(client.sessionQuery(query, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(client.sessionQuery(onlySession)).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(
        client.sessionMutation(mutation, { id: "one" }),
      ).toEqualTypeOf<Promise<Result>>();
      expectTypeOf(client.sessionAction(action, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      const session = runSessionFunctions(ctx, sessionId);
      expectTypeOf(session.runSessionQuery(query, { id: "one" })).toEqualTypeOf<
        Promise<Result>
      >();
      expectTypeOf(
        session.runSessionMutation(mutation, { id: "one" }),
      ).toEqualTypeOf<Promise<Result>>();
      expectTypeOf(
        session.runSessionAction(action, { id: "one" }),
      ).toEqualTypeOf<Promise<Result>>();
      // @ts-expect-error Non-session arguments remain required.
      useSessionQuery(query);
      // @ts-expect-error Argument types are preserved.
      void client.sessionMutation(mutation, { id: 1 });
      // @ts-expect-error Session IDs are supplied by the wrapper.
      void session.runSessionQuery(query, { id: "one", sessionId });
    },
  ).toBeFunction();
});

test("migration and retry helpers accept future references", () => {
  type MigrationArgs = FunctionArgs<Parameters<typeof startMigration>[1]>;
  type Migration = FunctionReference_future<
    "mutation",
    "internal",
    MigrationArgs
  >;
  type RetryAction = FunctionReference_future<
    "action",
    "internal",
    { id: string },
    null
  >;
  expectTypeOf(
    (
      ctx: GenericActionCtx<GenericDataModel>,
      scheduler: Scheduler,
      migration: Migration,
      action: RetryAction,
    ) => {
      void startMigration({ scheduler }, migration);
      void startMigrationsSerially({ scheduler }, [migration]);
      const { runWithRetries } = makeActionRetrier("test:retry");
      void runWithRetries(ctx, action, { id: "one" });
      // @ts-expect-error Retry arguments retain their types.
      void runWithRetries(ctx, action, { id: 1 });
    },
  ).toBeFunction();
  expectTypeOf<Migration[]>().toExtend<
    NonNullable<Parameters<typeof getStatus>[1]["migrations"]>
  >();
  expectTypeOf<Migration>().toExtend<Parameters<typeof cancelMigration>[2]>();
});
