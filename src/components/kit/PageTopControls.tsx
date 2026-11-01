import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const ControlsContext = createContext<{ target: HTMLElement | null; setTarget: (node: HTMLElement | null) => void; left: HTMLElement | null; setLeft: (node: HTMLElement | null) => void; warnings: HTMLElement | null; setWarnings: (node: HTMLElement | null) => void } | null>(null);
/** Relocate existing table controls without changing their owner, state or handlers. */
export function PageTopControlsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [warnings, setWarnings] = useState<HTMLElement | null>(null);
  const [left, setLeft] = useState<HTMLElement | null>(null);
  return <ControlsContext.Provider value={{ target, setTarget, left, setLeft, warnings, setWarnings }}>{children}</ControlsContext.Provider>;
}
export function PageNotice({ children }: { children: ReactNode }) {
  const controls = usePageTopControls();
  return controls?.warnings ? createPortal(<div className="page-bani-notice">{children}</div>, controls.warnings) : <>{children}</>;
}
export function usePageTopControls() { return useContext(ControlsContext); }
export function PageControls({ children, side = 'right' }: { children: ReactNode; side?: 'left' | 'right' }) {
  const controls = usePageTopControls();
  const target = side === 'left' ? controls?.left : controls?.target;
  return target ? createPortal(children, target) : <>{children}</>;
}