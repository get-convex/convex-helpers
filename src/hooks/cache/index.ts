/**
 * Convex Query Cache
 *
 * This module exposes a `useQuery` alternative that is backed by an in-memory
 * cache. The cache will maintain reference counts for deployment-backed
 * queries the app is using. When a reference count for a particular query/arg
 * combination drops to zero, the cache will maintain the backend subscription
 * for some configurable period of time before unsubscribing.
 *
 * This allows an app that is rapidly switching between pages/views to quickly
 * restore query values for recently-used queries. In addition, those values
 * are kept up-to-date in the background via the active subscription, and
 * consistent with the rest of the values used by the app.
 *
 * This `useQuery` hook requires the installation of a `ConvexQueryCacheProvider`
 * in the root of your app.
 */
import { useQuery } from "./useQuery";
import { ConvexQueryCacheProvider } from "./provider";
import { ConvexQueryCacheOptions } from "./core";

export { useQuery, ConvexQueryCacheProvider };
export type { ConvexQueryCacheOptions };
