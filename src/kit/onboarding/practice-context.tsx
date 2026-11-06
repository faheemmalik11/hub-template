import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "onboarding-practice-task-id";

interface OnboardingPracticeContextValue {
  activeTaskId: string | null;
  startTask: (taskId: string) => void;
  stopTask: () => void;
  allowedPath: string | null;
  setAllowedPath: (path: string | null) => void;
}

const OnboardingPracticeContext = createContext<OnboardingPracticeContextValue | null>(null);

function readStoredTaskId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function OnboardingPracticeProvider({ children }: { children: ReactNode }) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(readStoredTaskId);
  const [allowedPath, setAllowedPath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeTaskId) {
      window.sessionStorage.setItem(STORAGE_KEY, activeTaskId);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [activeTaskId]);

  return (
    <OnboardingPracticeContext.Provider
      value={{
        activeTaskId,
        startTask: setActiveTaskId,
        stopTask: () => {
          setActiveTaskId(null);
          setAllowedPath(null);
        },
        allowedPath,
        setAllowedPath,
      }}
    >
      {children}
    </OnboardingPracticeContext.Provider>
  );
}

export function useOnboardingPractice(): OnboardingPracticeContextValue {
  const context = useContext(OnboardingPracticeContext);
  if (!context) {
    throw new Error("useOnboardingPractice must be used within OnboardingPracticeProvider");
  }
  return context;
}
