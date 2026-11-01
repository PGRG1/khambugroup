import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const ControlsContext = createContext<{ target: HTMLElement | null; setTarget: (node: HTMLElement | null) => void } | null>(null);
/** Relocate existing table controls without changing their owner, state or handlers. */
export function PageTopControlsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <ControlsContext.Provider value={{ target, setTarget }}>{children}</ControlsContext.Provider>;
}
export function usePageTopControls() { return useContext(ControlsContext); }
export function PageControls({ children }: { children: ReactNode }) {
  const controls = usePageTopControls();
  return controls?.target ? createPortal(children, controls.target) : <>{children}</>;
}