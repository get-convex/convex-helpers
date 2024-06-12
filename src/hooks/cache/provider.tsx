import { useConvex } from "convex/react";
import { createContext, FC, PropsWithChildren } from "react";
import { CacheRegistry, ConvexQueryCacheOptions } from "./core";

export const ConvexQueryCacheContext = createContext({
  registry: null as CacheRegistry | null,
});

/**
 * A provider that establishes a query cache context in the React render
 * tree so that cached `useQuery` calls can be used.
 *
 * @component
 * @param {ConvexQueryCacheOptions} props.options - Options for the query cache
 * @returns {Element}
 */
export const ConvexQueryCacheProvider: FC<
  PropsWithChildren<ConvexQueryCacheOptions>
> = ({ children, ...options }) => {
  const convex = useConvex();
  if (convex === undefined) {
    throw new Error(
      "Could not find Convex client! `ConvexQueryCacheProvider` must be used in the React component " +
        "tree under `ConvexProvider`. Did you forget it? " +
        "See https://docs.convex.dev/quick-start#set-up-convex-in-your-react-app",
    );
  }
  const registry = new CacheRegistry(convex, options);
  return (
    <ConvexQueryCacheContext.Provider value={{ registry }}>
      {children}
    </ConvexQueryCacheContext.Provider>
  );
};
