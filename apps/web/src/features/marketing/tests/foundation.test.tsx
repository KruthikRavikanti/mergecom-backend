import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Brand } from '../../../components/layout/Brand';
import {
  DisplayHeading,
  MarketingButton,
  MarketingSection,
} from '../components/MarketingPrimitives';
import { approvedClaims, benefits, prohibitedClaims } from '../content/site';

describe('marketing foundation', () => {
  it('renders accessible brand and action variants', () => {
    render(
      <MemoryRouter>
        <Brand compact inverse />
        <MarketingButton href="/request-access">Request access</MarketingButton>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'MergeCom home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Request access' })).toHaveClass(
      'is-primary',
    );
  });

  it('scopes section and typography primitives to marketing classes', () => {
    render(
      <MarketingSection tone="night">
        <DisplayHeading>Controlled momentum</DisplayHeading>
      </MarketingSection>,
    );

    expect(screen.getByRole('heading')).toHaveClass('marketing-display');
    expect(screen.getByRole('heading').closest('section')).toHaveClass(
      'marketing-tone-night',
    );
  });

  it('publishes only approved implementation-backed claims', () => {
    expect(approvedClaims(benefits)).toHaveLength(benefits.length);
    expect(approvedClaims(benefits)).not.toContainEqual(
      expect.objectContaining({ status: 'future' }),
    );
    expect(prohibitedClaims).toContain('unearned certifications');
  });
});
