import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createDefaultTreatmentRepository,
  type ITreatmentRepository,
} from '@/services/repositories/treatmentRepository';

const TreatmentRepositoryContext = createContext<
  ITreatmentRepository | null | undefined
>(undefined);

export interface TreatmentRepositoryProviderProps {
  readonly children: ReactNode;
  readonly repository?: ITreatmentRepository | null;
}

export function TreatmentRepositoryProvider({
  children,
  repository,
}: TreatmentRepositoryProviderProps) {
  const resolved = useMemo(
    () =>
      repository !== undefined
        ? repository
        : createDefaultTreatmentRepository(),
    [repository],
  );

  return (
    <TreatmentRepositoryContext.Provider value={resolved}>
      {children}
    </TreatmentRepositoryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTreatmentRepository(
  overrideRepository?: ITreatmentRepository | null,
): ITreatmentRepository | null {
  const contextRepo = useContext(TreatmentRepositoryContext);

  return useMemo(() => {
    if (overrideRepository !== undefined) {
      return overrideRepository;
    }
    if (contextRepo !== undefined) {
      return contextRepo;
    }
    return createDefaultTreatmentRepository();
  }, [contextRepo, overrideRepository]);
}
