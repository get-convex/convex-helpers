import Counter from "./components/Counter";
import CrudExample from "./components/CrudExample";
import RelationshipExample from "./components/RelationshipExample";
import SessionsExample from "./components/SessionsExample";
import ZodExample from "./components/ZodExample";
import { HonoExample } from "./components/HonoExample";
import FilterExample from "./components/FilterExample";

export default function App() {
  return (
    <main>
      <Counter />
      <ZodExample />
      <RelationshipExample />
      <CrudExample />
      <SessionsExample />
      <HonoExample />
      <FilterExample />
    </main>
  );
}
