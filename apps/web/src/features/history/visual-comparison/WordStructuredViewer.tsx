import { FileMinus2, FilePlus2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { ComparisonChange } from '../../../api/queries';
import { changeForPath, type WordData } from './visual-types';

export function WordStructuredViewer({
  changes,
  data,
  selectedChange,
  side,
}: {
  changes: ComparisonChange[];
  data: WordData;
  selectedChange?: ComparisonChange | undefined;
  side: 'base' | 'target';
}) {
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const selectedPath = selectedChange?.path;

  useEffect(() => {
    if (!selectedPath) return;
    const direct = blockRefs.current.get(selectedPath);
    const nearest =
      direct ??
      [...blockRefs.current.entries()].find(
        ([path]) =>
          selectedPath.startsWith(`${path}/`) ||
          path.startsWith(`${selectedPath}/`),
      )?.[1];
    nearest?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedPath, side]);

  const selectedMissing =
    selectedChange &&
    ((selectedChange.changeType === 'added' && side === 'base') ||
      (selectedChange.changeType === 'removed' && side === 'target'));

  return (
    <div className="word-structured-scroll">
      <article className="word-page">
        {selectedMissing ? (
          <div className={`word-ghost change-${selectedChange.changeType}`}>
            {selectedChange.changeType === 'added' ? (
              <FilePlus2 aria-hidden="true" size={18} />
            ) : (
              <FileMinus2 aria-hidden="true" size={18} />
            )}
            <span>
              {selectedChange.changeType === 'added'
                ? 'Content exists only in the target version.'
                : 'Content exists only in the base version.'}
            </span>
          </div>
        ) : null}
        {data.blocks.map((block) => {
          const change = changeForPath(changes, block.path);
          const selected = Boolean(
            selectedPath &&
            (selectedPath === block.path ||
              selectedPath.startsWith(`${block.path}/`) ||
              block.path.startsWith(`${selectedPath}/`)),
          );
          const Tag = headingTag(block.style);
          const className = [
            'word-block',
            `word-${block.kind.replace(/_/gu, '-')}`,
            change ? `change-${change.changeType}` : '',
            selected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const content =
            selected && selectedChange?.changeType === 'modified' ? (
              <InlineDifference change={selectedChange} side={side} />
            ) : (
              block.text || '\u00a0'
            );
          return (
            <Tag
              className={className}
              data-path={block.path}
              key={block.path}
              ref={(element) => {
                if (element) blockRefs.current.set(block.path, element);
                else blockRefs.current.delete(block.path);
              }}
            >
              {content}
            </Tag>
          );
        })}
      </article>
    </div>
  );
}

function InlineDifference({
  change,
  side,
}: {
  change: ComparisonChange;
  side: 'base' | 'target';
}) {
  const before = tokens(change.before ?? '');
  const after = tokens(change.after ?? '');
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const source = side === 'base' ? before : after;
  const middleEnd = source.length - suffix;
  return (
    <>
      {source.slice(0, prefix).join('')}
      <mark className={side === 'base' ? 'word-removed' : 'word-added'}>
        {source.slice(prefix, middleEnd).join('') || '\u00a0'}
      </mark>
      {source.slice(middleEnd).join('')}
    </>
  );
}

function tokens(value: string): string[] {
  return value.split(/(\s+)/u).filter((token) => token.length > 0);
}

function headingTag(style: string | null): 'div' | 'h1' | 'h2' | 'h3' | 'p' {
  const normalized = style?.toLowerCase() ?? '';
  if (normalized.includes('heading1') || normalized.includes('heading 1')) {
    return 'h1';
  }
  if (normalized.includes('heading2') || normalized.includes('heading 2')) {
    return 'h2';
  }
  if (normalized.includes('heading3') || normalized.includes('heading 3')) {
    return 'h3';
  }
  return normalized.includes('table') ? 'div' : 'p';
}
