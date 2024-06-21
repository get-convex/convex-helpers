"use client";
import { useConvex, ConvexReactClient } from "convex/react";
import {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { createContext, FC, PropsWithChildren } from "react";

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

const DEFAULT_EXPIRATION_MS = 300_000; // 5 minutes
const DEFAULT_MAX_ENTRIES = 250;

export type ConvexQueryCacheOptions = {
  /**
   * How long, in milliseconds, to keep the subscription to the convex
   * query alive even after all references in the app have been dropped.
   *
   * @default 300000
   */
  expiration?: number;

  /**
   * How many "extra" idle query subscriptions are allowed to remain
   * connected to your convex backend.
   *
   * @default Infinity
   */
  maxIdleEntries?: number;

  /**
   * A debug flag that will cause information about the query cache
   * to be logged to the console every 3 seconds.
   *
   * @default false
   */
  debug?: boolean;
};

/**
 * Implementation of the query cache.
 */

type SubKey = string;
type QueryKey = string;
type CachedQuery<Query extends FunctionReference<"query">> = {
  refs: Set<string>;
  evictTimer: number | null; // SetTimeout
  unsub?: () => void;
  value?: FunctionReturnType<Query> | Error;
};
type SubEntry<Query extends FunctionReference<"query">> = {
  queryKey: QueryKey;
  setter: (v?: FunctionReturnType<Query>) => void;
};

// Core caching structure.
class CacheRegistry {
  queries: Map<QueryKey, CachedQuery<FunctionReference<"query">>>;
  subs: Map<SubKey, SubEntry<FunctionReference<"query">>>;
  convex: ConvexReactClient;
  timeout: number;
  maxIdleEntries: number;
  idle: number;

  constructor(convex: ConvexReactClient, options: ConvexQueryCacheOptions) {
    this.queries = new Map();
    this.subs = new Map();
    this.convex = convex;
    this.idle = 0;
    this.timeout = options.expiration ?? DEFAULT_EXPIRATION_MS;
    this.maxIdleEntries = options.maxIdleEntries ?? DEFAULT_MAX_ENTRIES;
    if (options.debug ?? false) {
      const weakThis = new WeakRef(this);
      const debugInterval = setInterval(() => {
        const r = weakThis.deref();
        if (r === undefined) {
          clearInterval(debugInterval);
        } else {
          r.debug();
        }
      }, 3000);
    }
  }
  #getQueryEntry(
    queryKey: QueryKey,
  ): CachedQuery<FunctionReference<"query">> | undefined {
    const entry = this.queries.get(queryKey);
    return entry;
  }

  probe<Query extends FunctionReference<"query">>(
    queryKey: QueryKey,
  ): FunctionReturnType<Query> | undefined {
    const entry = this.#getQueryEntry(queryKey);
    return entry === undefined ? undefined : entry.value;
  }

  // Enable a new subscription.
  start<Query extends FunctionReference<"query">>(
    id: string,
    queryKey: string,
    query: Query,
    args: FunctionArgs<Query>,
    setter: (v: FunctionReturnType<Query>) => void,
  ): void {
    let entry = this.#getQueryEntry(queryKey);
    this.subs.set(id, {
      queryKey,
      setter,
    });
    if (entry === undefined) {
      entry = {
        refs: new Set(),
        evictTimer: null,
      };
      const w = this.convex.watchQuery(query, args);
      const unsub = w.onUpdate(() => {
        const e = entry!;
        try {
          e.value = w.localQueryResult();
        } catch (err) {
          e.value = err;
        }
        for (const ref of e.refs.values()) {
          this.subs.get(ref)?.setter(e.value);
        }
      });
      entry.unsub = unsub;
      this.queries.set(queryKey, entry);
    } else if (entry.evictTimer !== null) {
      this.idle -= 1;
      clearTimeout(entry.evictTimer);
      entry.evictTimer = null;
    }
    entry.refs.add(id);
    if (entry.value !== undefined) {
      setter(entry.value);
    }
  }
  // End a previous subscription.
  end(id: string) {
    const sub = this.subs.get(id);
    if (sub) {
      this.subs.delete(id);
      const cq = this.queries.get(sub.queryKey);
      const qk = sub.queryKey;
      cq?.refs.delete(id);
      // None left?
      if (cq?.refs.size === 0) {
        const remove = () => {
          cq.unsub!();
          this.queries.delete(qk);
        };
        if (this.idle == this.maxIdleEntries) {
          remove();
        } else {
          this.idle += 1;
          const evictTimer = window.setTimeout(() => {
            this.idle -= 1;
            remove();
          }, this.timeout);
          cq.evictTimer = evictTimer;
        }
      }
    }
  }
  debug() {
    console.log("DEBUG CACHE");
    console.log(`IDLE = ${this.idle}`);
    console.log(" SUBS");
    for (const [k, v] of this.subs.entries()) {
      console.log(`  ${k} => ${v.queryKey}`);
    }
    console.log(" QUERIES");
    for (const [k, v] of this.queries.entries()) {
      console.log(
        `  ${k} => ${v.refs.size} refs, evict = ${v.evictTimer}, value = ${v.value}`,
      );
    }
    console.log("~~~~~~~~~~~~~~~~~~~~~~");
  }
}
