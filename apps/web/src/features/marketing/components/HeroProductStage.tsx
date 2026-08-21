export function HeroProductStage() {
  return (
    <div aria-hidden="true" className="hero-product-stage">
      <div className="hero-stage-chrome">
        <span />
        <span />
        <span />
        <strong>Confidential Information Memorandum.pptx</strong>
      </div>
      <div className="hero-stage-toolbar">
        <strong>Visual comparison</strong>
        <span>Side by side</span>
        <span>Overlay</span>
        <span>Structured</span>
      </div>
      <div className="hero-stage-workspace">
        <aside>
          <small>12 CHANGES</small>
          <strong>Slide 6</strong>
          <span className="is-selected">Revenue bridge</span>
          <span>Market overview</span>
          <span>Operating case</span>
          <span>Appendix</span>
        </aside>
        <div className="hero-stage-slide before">
          <small>VERSION 7</small>
          <strong>Operating outlook</strong>
          <div className="hero-chart-bars">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>Base case revenue progression</p>
        </div>
        <div className="hero-stage-slide after">
          <small>VERSION 8</small>
          <strong>Operating outlook</strong>
          <div className="hero-chart-bars">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>Updated revenue progression</p>
          <b>CHANGED</b>
        </div>
        <aside className="hero-stage-inspector">
          <small>CHANGE 4 OF 12</small>
          <strong>Chart data changed</strong>
          <p>Series values and source range were updated.</p>
          <span>Review evidence</span>
        </aside>
      </div>
    </div>
  );
}
