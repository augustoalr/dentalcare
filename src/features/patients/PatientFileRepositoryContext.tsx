import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createDefaultPatientFileRepository,
  type IPatientFileRepository,
} from '@/services/repositories/patientFileRepository';

const PatientFileRepositoryContext = createContext<
  IPatientFileRepository | null | undefined
>(undefined);

export interface PatientFileRepositoryProviderProps {
  readonly children: ReactNode;
  readonly repository?: IPatientFileRepository | null;
}

export function PatientFileRepositoryProvider({
  children,
  repository,
}: PatientFileRepositoryProviderProps) {
  const resolved = useMemo(
    () =>
      repository !== undefined
        ? repository
        : createDefaultPatientFileRepository(),
    [repository],
  );

  return (
    <PatientFileRepositoryContext.Provider value={resolved}>
      {children}
    </PatientFileRepositoryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePatientFileRepository(
  overrideRepository?: IPatientFileRepository | null,
): IPatientFileRepository | null {
  const contextRepo = useContext(PatientFileRepositoryContext);

  return useMemo(() => {
    if (overrideRepository !== undefined) {
      return overrideRepository;
    }
    if (contextRepo !== undefined) {
      return contextRepo;
    }
    return createDefaultPatientFileRepository();
  }, [contextRepo, overrideRepository]);
}
