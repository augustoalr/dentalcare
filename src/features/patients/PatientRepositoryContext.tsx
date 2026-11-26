import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createDefaultPatientRepository,
  type IPatientRepository,
} from '@/services/repositories/patientRepository';

const PatientRepositoryContext = createContext<
  IPatientRepository | null | undefined
>(undefined);

export interface PatientRepositoryProviderProps {
  readonly children: ReactNode;
  readonly repository?: IPatientRepository | null;
}

export function PatientRepositoryProvider({
  children,
  repository,
}: PatientRepositoryProviderProps) {
  const resolved = useMemo(
    () =>
      repository !== undefined ? repository : createDefaultPatientRepository(),
    [repository],
  );

  return (
    <PatientRepositoryContext.Provider value={resolved}>
      {children}
    </PatientRepositoryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePatientRepository(
  overrideRepository?: IPatientRepository | null,
): IPatientRepository | null {
  const contextRepo = useContext(PatientRepositoryContext);

  return useMemo(() => {
    if (overrideRepository !== undefined) {
      return overrideRepository;
    }
    if (contextRepo !== undefined) {
      return contextRepo;
    }
    return createDefaultPatientRepository();
  }, [contextRepo, overrideRepository]);
}
