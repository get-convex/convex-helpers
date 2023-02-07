import {
  GenericAPI,
  NamedQuery,
  QueryNames,
  MutationNames,
  ActionNames,
  NamedMutation,
} from "convex/browser";
import { NamedAction } from "convex/dist/types/api/api";
import { Watch, ReactMutation, ReactAction } from "convex/react";

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

export class MockConvexReactClient<API extends GenericAPI> {
  queries?: MockQueries<API>;

  constructor({
    queries,
    mutations,
  }: {
    queries?: MockQueries<API>;
    mutations?: MockMutations<API>;
  });

  setAuth(): void;
  clearAuth(): void;
  watchQuery<Name extends QueryNames<API>>(
    name: Name,
    args: Parameters<NamedQuery<API, Name>>
  ): Watch<ReturnType<NamedQuery<API, Name>>>;

  mutation<Name extends MutationNames<API>>(
    name: Name
  ): ReactMutation<API, Name>;
  action<Name extends ActionNames<API>>(): ReactAction<API, Name>;
  connectionState(): {
    hasInflightRequests: false;
    isWebSocketConnected: true;
  };

  close(): Promise<void>;
}
