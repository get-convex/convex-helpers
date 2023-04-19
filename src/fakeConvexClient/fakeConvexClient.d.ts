import {
  GenericAPI,
  NamedAction,
  NamedQuery,
  NamedMutation,
  OptimisticUpdate,
  ArgsObject,
} from "convex/browser";
import { ConvexReactClient, ReactMutation } from "convex/react";

export type FakeQueries<API extends GenericAPI> = {
  [Name in keyof API["publicQueries"] & string]?: (
    ...args: Parameters<NamedQuery<API, Name>>
  ) => ReturnType<NamedQuery<API, Name>> | undefined;
};

export type FakeMutations<API extends GenericAPI> = {
  [Name in keyof API["publicMutations"] & string]?: {
    (...args: Parameters<NamedMutation<API, Name>>): ReturnType<
      NamedMutation<API, Name>
    >;

    withOptimisticUpdate?(
      optimisticUpdate: OptimisticUpdate<
        API,
        ArgsObject<NamedMutation<API, Name>>
      >
    ): ReactMutation<API, Name>;
  };
};

export type MockActions<API extends GenericAPI> = {
  [Name in keyof API["publicActions"] & string]?: (
    ...args: Parameters<NamedAction<API, Name>>
  ) => ReturnType<NamedAction<API, Name>>;
};

export class ConvexReactClientFake<
  API extends GenericAPI
> extends ConvexReactClient<API> {
  queries?: FakeQueries<API>;

  constructor({
    queries,
    mutations,
  }: {
    queries?: FakeQueries<API>;
    mutations?: FakeMutations<API>;
  });
}
