import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import ServerApp from "./ServerApp.jsx";

export function render(url = "/", initialData = null) {
  globalThis.__HOOMAN_PRERENDER_DATA__ = initialData || null;
  try {
    return renderToString(
      <React.StrictMode>
        <StaticRouter location={url}>
          <ServerApp />
        </StaticRouter>
      </React.StrictMode>
    );
  } finally {
    delete globalThis.__HOOMAN_PRERENDER_DATA__;
  }
}
