import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { decaid } from "./services/decaidConnection.ts";
import "./index.css";

if (typeof window !== "undefined") {
  (window as any).decaid = decaid;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
