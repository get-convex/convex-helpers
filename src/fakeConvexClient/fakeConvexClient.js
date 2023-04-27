// A Mock convex client
export class ConvexReactClientFake {
  constructor({ queries, mutations, actions }) {
    this.queries = queries;
    this.mutations = mutations;
    this.actions = actions;
  }

  async setAuth() {
    throw new Error("Auth is not implemented");
  }

  clearAuth() {
    throw new Error("Auth is not implemented");
  }

  watchQuery(name, args) {
    return {
      localQueryResult: () => {
        const query = this.queries && this.queries[name];
        if (query) {
          return query(args);
        }
        throw new Error(
          `Unexpected query: ${name}. Try providing a function for this query in the mock client constructor.`
        );
      },
      onUpdate: () => () => ({
        unsubscribe: () => null,
      }),
      journal: () => {
        throw new Error("Pagination is not implemented");
      },
    };
  }

  mutation(name) {
    const mutation = this.mutations && this.mutations[name];
    if (mutation) {
      const mut = (args) => mutation(args);

      const withOptimisticUpdate = mutation.withOptimisticUpdate
        ? mutation.withOptimisticUpdate
        : () => mut;
      mut.withOptimisticUpdate = withOptimisticUpdate;
      return mut;
    }
    throw new Error(
      `Unexpected mutation: ${name}. Try providing a function for this mutation in the mock client constructor.`
    );
  }

  action(name) {
    const action = this.actions && this.actions[name];
    if (action) {
      return action;
    }
    throw new Error(
      `Unexpected action: ${name}. Try providing a function for this actionin the mock client constructor.`
    );
  }

  connectionState() {
    return {
      hasInflightRequests: false,
      isWebSocketConnected: true,
    };
  }

  close() {
    return Promise.resolve();
  }
}
