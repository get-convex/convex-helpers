import { GenericAPI, NamedQuery, NamedMutation } from "convex/browser";
import { NamedAction } from "convex/dist/types/api/api";
import { ConvexReactClient } from "convex/react";

export type MockQueries<API extends GenericAPI> = {
  [Name in keyof API["queries"] & string]?: (
    ...args: Parameters<NamedQuery<API, Name>>
  ) => ReturnType<NamedQuery<API, Name>> | undefined;
};

export type MockMutations<API extends GenericAPI> = {
  [Name in keyof API["mutations"] & string]?: (
    ...args: Parameters<NamedMutation<API, Name>>
  ) => ReturnType<NamedMutation<API, Name>>;
};

export type MockActions<API extends GenericAPI> = {
  [Name in keyof API["actions"] & string]?: (
    ...args: Parameters<NamedAction<API, Name>>
  ) => ReturnType<NamedAction<API, Name>>;
};

export class MockConvexReactClient<
  API extends GenericAPI
> extends ConvexReactClient<API> {
  queries?: MockQueries<API>;

  constructor({
    queries,
    mutations,
  }: {
    queries?: MockQueries<API>;
    mutations?: MockMutations<API>;
  });
}
