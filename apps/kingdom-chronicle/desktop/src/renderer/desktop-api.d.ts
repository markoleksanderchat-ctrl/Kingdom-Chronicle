/// <reference types="vite/client" />
import type { KingdomDesktopApi } from "../types";

declare global {
  interface Window {
    kingdomDesktop: KingdomDesktopApi;
  }
}

export {};
