import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface PreviewModeContextType {
  previewUserId: string | null;
  previewUserEmail: string | null;
  setPreviewUser: (userId: string | null, email?: string | null) => void;
  isPreviewActive: boolean;
  exitPreview: () => void;
}

const PreviewModeContext = createContext<PreviewModeContextType>({
  previewUserId: null,
  previewUserEmail: null,
  setPreviewUser: () => {},
  isPreviewActive: false,
  exitPreview: () => {},
});

export const usePreviewMode = () => useContext(PreviewModeContext);

export const PreviewModeProvider = ({ children }: { children: ReactNode }) => {
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [previewUserEmail, setPreviewUserEmail] = useState<string | null>(null);

  const setPreviewUser = useCallback((userId: string | null, email?: string | null) => {
    setPreviewUserId(userId);
    setPreviewUserEmail(email ?? null);
  }, []);

  const exitPreview = useCallback(() => {
    setPreviewUserId(null);
    setPreviewUserEmail(null);
  }, []);

  return (
    <PreviewModeContext.Provider value={{
      previewUserId,
      previewUserEmail,
      setPreviewUser,
      isPreviewActive: !!previewUserId,
      exitPreview,
    }}>
      {children}
    </PreviewModeContext.Provider>
  );
};
