import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { MarketingFooter } from '../components/MarketingFooter';
import { SecurityChapter } from '../components/SecurityChapter';
import { MarketingSecurityPage } from '../pages/MarketingSecurityPage';
import { MarketingSupportPage } from '../pages/MarketingSupportPage';
import { RequestAccessPage } from '../pages/RequestAccessPage';

afterEach(cleanup);

describe('marketing trust and conversion', () => {
  it('shows a truthful request-access fallback without a delivery provider', () => {
    render(
      <MemoryRouter>
        <RequestAccessPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Online request delivery is not connected/u),
    ).toBeVisible();
    expect(
      screen.getByText(/No information has been collected/u),
    ).toBeVisible();
  });

  it('shows a truthful support fallback without pretending to submit tickets', () => {
    render(
      <MemoryRouter>
        <MarketingSupportPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Online ticket delivery is not connected/u),
    ).toBeVisible();
  });

  it('renders implementation-backed security claims without certification badges', () => {
    const { container } = render(
      <MemoryRouter>
        <SecurityChapter />
        <MarketingSecurityPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Immutable original packages')).toHaveLength(2);
    expect(container).not.toHaveTextContent(/SOC 2|ISO 27001|GDPR certified/u);
    expect(container).toHaveTextContent(
      /No independent compliance certification/u,
    );
  });

  it('publishes only live footer destinations', () => {
    render(
      <MemoryRouter>
        <MarketingFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/product',
    );
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      '/support',
    );
    expect(
      screen.queryByRole('link', { name: 'Careers' }),
    ).not.toBeInTheDocument();
  });
});
