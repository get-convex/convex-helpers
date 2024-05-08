import Counter from "./components/Counter";
import RelationshipExample from "./components/RelationshipExample";
import SessionsExample from "./components/SessionsExample";
import { HonoExample } from "./components/HonoExample";
import RowLevelSecurityExample from "./components/RowLevelSecurityExample";
import { SessionProvider } from "convex-helpers/react/sessions";
// Used for the session example if you want to store sessionId in local storage
// import { useLocalStorage } from "usehooks-ts";

export default function App() {
  return (
    <main>
      <SessionProvider
      // storageKey={"ConvexSessionId"}
      // useStorage={useLocalStorage}
      >
        <Counter />
        <RelationshipExample />
        <SessionsExample />
        <HonoExample />
        <RowLevelSecurityExample />
      </SessionProvider>
    </main>
  );
}
