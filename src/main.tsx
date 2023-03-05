import { StrictMode } from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SessionProvider } from "./hooks/session";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

ReactDOM.render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <SessionProvider storageLocation={"sessionStorage"}>
        <App />
      </SessionProvider>
    </ConvexProvider>
  </StrictMode>,
  document.getElementById("root")
);
