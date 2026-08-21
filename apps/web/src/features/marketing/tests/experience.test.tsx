import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormatCapabilities } from '../components/FormatCapabilities';
import { HeroSection } from '../components/HeroSection';
import { MarketingHeader } from '../components/MarketingHeader';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
});

describe('marketing experience', () => {
  it('opens and closes the mobile navigation with focus restoration', () => {
    render(
      <MemoryRouter>
        <MarketingHeader />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Mobile primary navigation' }),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('changes format tabs with keyboard controls', () => {
    render(<FormatCapabilities />);
    const word = screen.getByRole('tab', { name: 'Word' });
    fireEvent.keyDown(word, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Excel' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/Sheets, cells, formulas/u)).toBeVisible();
  });

  it('keeps the hero complete without video playback', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Version control for the documents that run your firm.',
      }),
    ).toBeVisible();
    expect(
      document.querySelector('.marketing-hero-poster img'),
    ).toHaveAttribute('src', '/marketing/comparison-workspace.webp');
    expect(
      screen.getByRole('link', { name: /Request access/u }),
    ).toHaveAttribute('href', '/request-access');
  });
});
