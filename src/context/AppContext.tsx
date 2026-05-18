import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AppContextType {
  recesoUniversitario: boolean;
  setRecesoUniversitario: (value: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [recesoUniversitario, setRecesoUniversitarioState] = useState<boolean>(() => {
    const saved = localStorage.getItem('flux_receso_universitario');
    return saved === 'true';
  });

  const setRecesoUniversitario = (value: boolean) => {
    setRecesoUniversitarioState(value);
    localStorage.setItem('flux_receso_universitario', value.toString());
  };

  return (
    <AppContext.Provider value={{ recesoUniversitario, setRecesoUniversitario }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
