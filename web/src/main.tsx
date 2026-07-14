import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LabPage from "./lab-page";
import "./styles.css";

const page = window.location.pathname === "/settings" ? <LabPage /> : <App />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>
);
