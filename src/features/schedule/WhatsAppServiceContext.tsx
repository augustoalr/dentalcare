import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createDefaultWhatsAppService,
  type IWhatsAppService,
} from '@/services/whatsapp/whatsappService';

const WhatsAppServiceContext = createContext<IWhatsAppService | undefined>(
  undefined,
);

export interface WhatsAppServiceProviderProps {
  readonly children: ReactNode;
  readonly service?: IWhatsAppService;
}

export function WhatsAppServiceProvider({
  children,
  service,
}: WhatsAppServiceProviderProps) {
  const resolved = useMemo(
    () => (service !== undefined ? service : createDefaultWhatsAppService()),
    [service],
  );

  return (
    <WhatsAppServiceContext.Provider value={resolved}>
      {children}
    </WhatsAppServiceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWhatsAppService(
  overrideService?: IWhatsAppService,
): IWhatsAppService {
  const contextService = useContext(WhatsAppServiceContext);

  return useMemo(() => {
    if (overrideService !== undefined) {
      return overrideService;
    }
    if (contextService !== undefined) {
      return contextService;
    }
    return createDefaultWhatsAppService();
  }, [contextService, overrideService]);
}
