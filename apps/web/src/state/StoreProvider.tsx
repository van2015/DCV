import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "../api/client.js";
import { AppStore } from "./store.js";

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({
  store,
  children
}: {
  store?: AppStore;
  children: ReactNode;
}) {
  const [fallback] = useState(() => new AppStore(createClient()));
  const value = store ?? fallback;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useAppStore debe usarse dentro de StoreProvider");
  }
  return store;
}

export function useAppState() {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
