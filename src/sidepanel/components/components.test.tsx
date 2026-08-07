import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import { Onboarding } from './Onboarding';
import { ErrorBanner } from './ErrorBanner';
describe('Onboarding', () => {
  it('opens the options page when asked', async () => { const openOptionsPage = vi.fn(); (globalThis as any).chrome = { runtime: { openOptionsPage } }; render(<Onboarding />); await userEvent.click(screen.getByRole('button', { name: S.onboarding.openSettings })); expect(openOptionsPage).toHaveBeenCalled(); });
});
describe('ErrorBanner', () => {
  it('renders the Vietnamese message for the code, never the code itself', () => { render(<ErrorBanner error={{ code: 'RATE_LIMIT' }} />); expect(screen.queryByText(/RATE_LIMIT/)).not.toBeInTheDocument(); expect(screen.getByText(/giới hạn tốc độ/)).toBeInTheDocument(); });
  it('exposes the raw model output behind a disclosure when there is one', async () => { render(<ErrorBanner error={{ code: 'SCHEMA', raw: '{{broken' }} />); await userEvent.click(screen.getByText(S.common.rawOutput)); expect(screen.getByText('{{broken')).toBeInTheDocument(); });
  it('shows a retry button only when a handler is given', async () => { const onRetry = vi.fn(); const { rerender } = render(<ErrorBanner error={{ code: 'NETWORK' }} />); expect(screen.queryByRole('button', { name: S.common.retry })).not.toBeInTheDocument(); rerender(<ErrorBanner error={{ code: 'NETWORK' }} onRetry={onRetry} />); await userEvent.click(screen.getByRole('button', { name: S.common.retry })); expect(onRetry).toHaveBeenCalled(); });
});
