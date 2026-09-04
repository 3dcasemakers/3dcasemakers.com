import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { CartProvider } from "./context/CartContext";
import "./index.css";

// The browser's native scroll restoration can silently re-apply the old
// scroll position on a new route (especially after opening a product from
// far down a page), fighting with our own scroll-to-top-on-navigate logic
// in App.tsx. Switching to "manual" hands scroll position fully to React
// Router / our own effect, so every navigation reliably lands at the top.
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>
);
