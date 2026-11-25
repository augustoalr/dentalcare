import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { MedicalAlertBanner } from './MedicalAlertBanner';

describe('UI state components', () => {
  it('renders LoadingState with accessible status role', () => {
    render(
      <LoadingState
        title="Loading appointments"
        description="Fetching today's schedule"
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading appointments');
    expect(status).toHaveTextContent("Fetching today's schedule");
  });

  it('renders ErrorState and triggers retry callback', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ErrorState
        title="Connection error"
        description="Could not reach the clinic workspace"
        retryLabel="Try again"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Connection error');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders EmptyState with title, description, and optional action', () => {
    render(
      <EmptyState
        title="No patients yet"
        description="Add a synthetic patient to begin"
        action={<button type="button">Create patient</button>}
      />,
    );

    expect(screen.getByText('No patients yet')).toBeInTheDocument();
    expect(screen.getByText('Add a synthetic patient to begin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create patient' })).toBeInTheDocument();
  });

  it('renders MedicalAlertBanner with alert role, icon, and safe overflow classes', () => {
    const longAllergyText =
      'Severe anaphylactic reaction to penicillin and related beta-lactam antibiotics with cross-reactivity warning';

    render(
      <MedicalAlertBanner
        label="Critical medical alert"
        title={longAllergyText}
        description="Confirm safe alternative before treatment"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Critical medical alert');
    expect(alert).toHaveTextContent(longAllergyText);
    expect(alert.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(longAllergyText)).toHaveClass('break-words');
  });
});
