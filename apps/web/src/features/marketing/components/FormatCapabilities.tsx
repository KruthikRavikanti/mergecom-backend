import { useState, type KeyboardEvent } from 'react';

import { formatProof } from '../content/site';
import {
  DisplayHeading,
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function FormatCapabilities() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = formatProof[selectedIndex];

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = selectedIndex;
    if (event.key === 'ArrowRight')
      next = (selectedIndex + 1) % formatProof.length;
    if (event.key === 'ArrowLeft')
      next = (selectedIndex - 1 + formatProof.length) % formatProof.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = formatProof.length - 1;
    setSelectedIndex(next);
    document.getElementById(`format-tab-${next}`)?.focus();
  };

  if (!selected) return null;
  const SelectedIcon = selected.icon;

  return (
    <MarketingSection id="formats" tone="night">
      <MarketingContainer className="format-capabilities-grid">
        <div>
          <SectionEyebrow>Format aware</SectionEyebrow>
          <DisplayHeading>Office files are not interchangeable.</DisplayHeading>
          <p className="format-capabilities-copy">
            MergeCom preserves each source package and changes the review lens
            to match the document. Previews support orientation and may differ
            from Microsoft Office rendering.
          </p>
        </div>
        <div className="format-tabs">
          <div
            aria-label="Office format"
            className="format-tab-list"
            role="tablist"
          >
            {formatProof.map((format, index) => (
              <button
                aria-controls={`format-panel-${index}`}
                aria-selected={selectedIndex === index}
                id={`format-tab-${index}`}
                key={format.title}
                role="tab"
                tabIndex={selectedIndex === index ? 0 : -1}
                type="button"
                onClick={() => setSelectedIndex(index)}
                onKeyDown={handleKeyDown}
              >
                {format.title}
              </button>
            ))}
          </div>
          <div
            aria-labelledby={`format-tab-${selectedIndex}`}
            className="format-tab-panel"
            id={`format-panel-${selectedIndex}`}
            role="tabpanel"
          >
            <SelectedIcon aria-hidden="true" size={34} />
            <p>{selected.detail}</p>
            <div
              aria-hidden="true"
              className={`format-document-preview is-${selected.title.toLowerCase()}`}
            >
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
