import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SessionProvider } from "convex-helpers/react/sessions";
// import { useLocalStorage } from "usehooks-ts";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <SessionProvider
      // storageKey={"ConvexSessionId"}
      // useStorage={useLocalStorage}
      >
        <App />
      </SessionProvider>
    </ConvexProvider>
  </StrictMode>
);
