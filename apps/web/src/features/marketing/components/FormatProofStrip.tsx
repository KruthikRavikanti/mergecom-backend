import { formatProof } from '../content/site';
import { MarketingContainer } from './MarketingPrimitives';

export function FormatProofStrip() {
  return (
    <section
      aria-label="Supported Microsoft Office formats"
      className="format-proof-strip"
    >
      <MarketingContainer className="format-proof-inner">
        <p>Built around exact Office packages</p>
        <ul>
          {formatProof.map(({ icon: Icon, title }) => (
            <li key={title}>
              <Icon aria-hidden="true" size={20} />
              <span>{title}</span>
            </li>
          ))}
        </ul>
      </MarketingContainer>
    </section>
  );
}
