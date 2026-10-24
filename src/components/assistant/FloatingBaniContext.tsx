import { createContext, useContext, useState, type ReactNode } from "react";
type Host = { token: string; node: HTMLElement };
const Context = createContext<{ host: Host | null; setHost: (host: Host | null) => void }>({ host: null, setHost: () => {} });
export function FloatingBaniProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null);
  return <Context.Provider value={{ host, setHost }}>{children}</Context.Provider>;
}
export const useFloatingBaniHost = () => useContext(Context);