import { FileText, Folder, FolderKanban, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWorkspaceSearchQuery } from '../../api/queries';

export function GlobalSearch({
  organizationId,
}: {
  organizationId: string | undefined;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useWorkspaceSearchQuery(organizationId, debounced);
  const items = search.data?.items ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const openResult = (index: number) => {
    const result = items[index];
    if (!result) return;
    setFocused(false);
    setQuery('');
    void navigate(result.destination);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(items.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter' && items.length) {
      event.preventDefault();
      openResult(activeIndex);
    } else if (event.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const showResults = focused && debounced.trim().length > 0;
  return (
    <div className="relative w-full max-w-xl">
      <label className="relative block">
        <span className="sr-only">Search workspace</span>
        <Search
          aria-hidden="true"
          className="absolute left-3 top-2.5 text-slate-400"
          size={17}
        />
        <input
          aria-autocomplete="list"
          aria-controls="workspace-search-results"
          aria-expanded={showResults}
          className="field h-10 pl-9 pr-9"
          placeholder="Search projects, folders, documents"
          ref={inputRef}
          role="combobox"
          value={query}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            aria-label="Clear search"
            className="absolute right-1.5 top-1.5 p-1.5 text-slate-400 hover:text-slate-700"
            title="Clear search"
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </label>
      {showResults ? (
        <div
          className="absolute left-0 right-0 top-11 z-30 border border-slate-200 bg-white shadow-xl"
          id="workspace-search-results"
          role="listbox"
        >
          {search.isLoading ? (
            <p className="px-4 py-3 text-sm text-slate-500">Searching...</p>
          ) : search.isError ? (
            <p className="px-4 py-3 text-sm text-red-700">
              Search is temporarily unavailable.
            </p>
          ) : items.length ? (
            items.map((item, index) => {
              const Icon =
                item.resourceType === 'project'
                  ? FolderKanban
                  : item.resourceType === 'folder'
                    ? Folder
                    : FileText;
              return (
                <button
                  aria-selected={index === activeIndex}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 ${index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                  key={`${item.resourceType}-${item.id}`}
                  role="option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openResult(index)}
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-slate-500"
                    size={17}
                  />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-slate-900">
                      {item.name}
                    </strong>
                    <span className="block truncate text-xs text-slate-500">
                      {item.breadcrumb}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-4 py-3 text-sm text-slate-500">
              No accessible metadata matches.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
