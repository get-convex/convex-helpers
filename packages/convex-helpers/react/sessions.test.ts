import { expectTypeOf } from "vitest";
import type { FunctionReference } from "convex/server";
import type { SessionArgsArray, SessionQueryArgsArray } from "./sessions";
import type { EmptyObject } from "..";
import type { SessionId } from "../server/sessions";

expectTypeOf<
  SessionQueryArgsArray<
    FunctionReference<
      "query",
      "public",
      { arg: string; sessionId: SessionId | null },
      any
    >
  >
>().toEqualTypeOf<[{ arg: string } | "skip"]>();

expectTypeOf<
  SessionQueryArgsArray<
    FunctionReference<"query", "public", { sessionId: SessionId | null }, any>
  >
>().toEqualTypeOf<[args?: EmptyObject | "skip" | undefined]>();

expectTypeOf<
  SessionArgsArray<
    FunctionReference<
      "mutation",
      "public",
      { arg: string; sessionId: SessionId },
      any
    >
  >
>().toEqualTypeOf<[{ arg: string }]>();

expectTypeOf<
  SessionArgsArray<
    FunctionReference<"mutation", "public", { sessionId: SessionId }, any>
  >
>().toEqualTypeOf<[args?: EmptyObject | undefined]>();
