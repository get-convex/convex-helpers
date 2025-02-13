import { ConvexReactClient, ReactMutation } from "convex/react";
import { FunctionReference } from "convex/server";

export class ConvexReactClientFake extends ConvexReactClient {
  constructor();

  registerQueryFake<FuncRef extends FunctionReference<"query", "public">>(
    funcRef: FuncRef,
    impl: (args: FuncRef["_args"]) => FuncRef["_returnType"],
  ): void;
  registerMutationFake<FuncRef extends FunctionReference<"mutation", "public">>(
    funcRef: FuncRef,
    impl: (args: FuncRef["_args"]) => FuncRef["_returnType"],
  ): void;
}
