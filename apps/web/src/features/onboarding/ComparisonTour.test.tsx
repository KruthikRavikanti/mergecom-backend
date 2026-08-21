import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '../../auth/session';
import { ComparisonTour } from './ComparisonTour';

const mutation = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const scrollIntoView = vi.fn();

vi.mock('../../api/queries', () => ({
  useUpdateOnboardingPreferencesMutation: () => ({ mutateAsync: mutation }),
}));

const user = {} as CurrentUser;

beforeEach(() => {
  mutation.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(cleanup);

function renderTour(onClose = vi.fn()) {
  render(
    <>
      <div data-tour="comparison-summary" />
      <div data-tour="change-rail" />
      <div data-tour="version-viewers" />
      <div data-tour="change-inspector" />
      <div data-tour="review-controls" />
      <ComparisonTour onClose={onClose} user={user} />
    </>,
  );
  return onClose;
}

describe('ComparisonTour', () => {
  it('uses keyboard navigation and honors reduced motion', () => {
    renderTour();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
    });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(
      screen.getByRole('heading', { name: 'Change rail' }),
    ).toBeInTheDocument();
  });

  it('persists a skipped tour when Escape is pressed', async () => {
    const onClose = renderTour();
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith({
        tour: { status: 'skipped', version: 'comparison-workspace-v1' },
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
