import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './dialog';

HTMLDialogElement.prototype.showModal = vi.fn(function (
  this: HTMLDialogElement,
) {
  this.open = true;
});

describe('Dialog', () => {
  it('provides an accessible name', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Create project">
        Body
      </Dialog>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Create project' }),
    ).toBeInTheDocument();
  });
});
