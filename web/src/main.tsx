import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LabPage from "./lab-page";
import SettingsPage from "./settings-page";
import "./styles.css";

const page = window.location.pathname === "/settings"
  ? <SettingsPage />
  : window.location.pathname === "/lab"
    ? <LabPage />
    : <App />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>
);
