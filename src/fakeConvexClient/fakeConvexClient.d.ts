import {
  GenericAPI,
  NamedQuery,
  NamedMutation,
  OptimisticUpdate,
} from "convex/browser";
import { NamedAction } from "convex/dist/types/api/api";
import { ConvexReactClient, ReactMutation } from "convex/react";

export type FakaQueries<API extends GenericAPI> = {
  [Name in keyof API["queries"] & string]?: (
    ...args: Parameters<NamedQuery<API, Name>>
  ) => ReturnType<NamedQuery<API, Name>> | undefined;
};

export type FakeMutations<API extends GenericAPI> = {
  [Name in keyof API["mutations"] & string]?: {
    (...args: Parameters<NamedMutation<API, Name>>): ReturnType<
      NamedMutation<API, Name>
    >;

    withOptimisticUpdate?(
      optimisticUpdate: OptimisticUpdate<
        API,
        Parameters<NamedMutation<API, Name>>
      >
    ): ReactMutation<API, Name>;
  };
};

export type MockActions<API extends GenericAPI> = {
  [Name in keyof API["actions"] & string]?: (
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
