import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComparisonChange } from '../../../api/queries';
import { ChangeNavigator } from './ChangeNavigator';

const changes: ComparisonChange[] = [
  {
    after: 'Annual',
    before: 'Quarterly',
    category: 'content',
    changeType: 'modified',
    entityType: 'paragraph',
    id: 'a'.repeat(64),
    impact: 'medium',
    label: 'Reporting period',
    path: '/body/paragraphs/0',
  },
  {
    after: '42',
    before: null,
    category: 'structure',
    changeType: 'added',
    entityType: 'table_cell',
    id: 'b'.repeat(64),
    impact: 'high',
    label: 'Forecast total',
    path: '/body/tables/0/rows/1/cells/2',
  },
];

afterEach(cleanup);

describe('ChangeNavigator', () => {
  it('filters changes and supports keyboard navigation', () => {
    const onFilterChange = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <ChangeNavigator
        changes={changes}
        filter="all"
        onFilterChange={onFilterChange}
        onSelect={onSelect}
        selectedId={changes[0]!.id}
        threadCounts={new Map([[changes[1]!.id, 2]])}
      />,
    );

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith(changes[1]);

    fireEvent.click(screen.getByRole('tab', { name: /Structure/u }));
    expect(onFilterChange).toHaveBeenCalledWith('structure');
    rerender(
      <ChangeNavigator
        changes={changes}
        filter="structure"
        onFilterChange={onFilterChange}
        onSelect={onSelect}
        selectedId={changes[1]!.id}
        threadCounts={new Map([[changes[1]!.id, 2]])}
      />,
    );
    expect(screen.queryByText('Reporting period')).not.toBeInTheDocument();
    expect(screen.getByText('Forecast total')).toBeInTheDocument();
    expect(screen.getByTitle('2 unresolved discussions')).toBeInTheDocument();
  });
});
