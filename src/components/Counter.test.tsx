import Counter from "./Counter";
import { render } from "@testing-library/react";
import { MockConvexReactClient } from "../mockClient/mockClient";
import { ConvexProvider } from "convex/react";
import { API } from "../../convex/_generated/api";
import { describe, it, expect, afterEach, vi } from "vitest";

let counters: Record<string, number> = {};

// A mock function very similar to the implementation of `incrementCounter` in `convex/counter.ts`
const incrementCounter = (name: string, increment: number) => {
  if (counters[name]) {
    counters[name] = counters[name] + increment;
  } else {
    counters[name] = increment;
  }
  return null;
};

const incrementCounterMock = vi.fn().mockImplementation(incrementCounter);

const mockClient = new MockConvexReactClient<API>({
  queries: {
    // Return the value of the requested counter.
    "counter:getCounter": (name) => counters[name],
  },
  mutations: {
    "counter:incrementCounter": incrementCounterMock,
  },
});

const setup = () =>
  render(
    // @ts-expect-error The mock client implementation intentionally does not fully complete
    // the ConvexReactClient interface.
    <ConvexProvider client={mockClient}>
      <Counter />
    </ConvexProvider>
  );

afterEach(() => {
  // Resets the counter state after every test
  counters = {};

  // Resets mocks after every test
  vi.restoreAllMocks();

  // Reset the dom after every test
  document.getElementsByTagName("html")[0].innerHTML = "";
});

describe("Counter", () => {
  it("renders the counter", async () => {
    const { getByText } = setup();
    expect(getByText("Here's the counter: 0")).not.toBeNull();
  });

  it("increments the counter", async () => {
    const { getByRole, queryByText } = setup();

    getByRole("button").click();

    // The mocked incrementCounter function will be called.
    expect(incrementCounterMock).toHaveBeenCalledOnce();
    expect(incrementCounterMock).toHaveBeenCalledWith("clicks", 1);

    // The MockConvexReactClient doesn't support reactivity, so we can't use it to test that components re-rendered with updated data.
    expect(queryByText("Here's the counter: 1")).toBeNull();
  });

  it("renders the counter with seeded data", async () => {
    // Update the test state before rendering the component to seed the getCounter query.
    incrementCounter("clicks", 100);

    const { getByText } = setup();

    expect(getByText("Here's the counter: 100")).not.toBeNull();
  });
});
