import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY } from '@/domain/locale';
import { I18nProvider } from '@/i18n';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';
import { WelcomePage } from './WelcomePage';

describe('WelcomePage', () => {
  it('switches live between English and Spanish and persists preference', async () => {
    const user = userEvent.setup();
    const storage = new InMemoryStorageAdapter();

    render(
      <I18nProvider storage={storage} initialLocale="en">
        <WelcomePage />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('heading', { name: en.welcome.heroTitle }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(screen.queryByText('welcome.heroTitle')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(
      screen.getByRole('heading', { name: es.welcome.heroTitle }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
    expect(screen.queryByText('welcome.heroTitle')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: es.language.switchToEn }),
    );

    expect(
      screen.getByRole('heading', { name: en.welcome.heroTitle }),
    ).toBeInTheDocument();
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });
});
