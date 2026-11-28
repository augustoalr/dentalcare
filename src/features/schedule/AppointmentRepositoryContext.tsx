import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createDefaultAppointmentRepository,
  type IAppointmentRepository,
} from '@/services/repositories/appointmentRepository';

const AppointmentRepositoryContext = createContext<
  IAppointmentRepository | null | undefined
>(undefined);

export interface AppointmentRepositoryProviderProps {
  readonly children: ReactNode;
  readonly repository?: IAppointmentRepository | null;
}

export function AppointmentRepositoryProvider({
  children,
  repository,
}: AppointmentRepositoryProviderProps) {
  const resolved = useMemo(
    () =>
      repository !== undefined
        ? repository
        : createDefaultAppointmentRepository(),
    [repository],
  );

  return (
    <AppointmentRepositoryContext.Provider value={resolved}>
      {children}
    </AppointmentRepositoryContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppointmentRepository(
  overrideRepository?: IAppointmentRepository | null,
): IAppointmentRepository | null {
  const contextRepo = useContext(AppointmentRepositoryContext);

  return useMemo(() => {
    if (overrideRepository !== undefined) {
      return overrideRepository;
    }
    if (contextRepo !== undefined) {
      return contextRepo;
    }
    return createDefaultAppointmentRepository();
  }, [contextRepo, overrideRepository]);
}
