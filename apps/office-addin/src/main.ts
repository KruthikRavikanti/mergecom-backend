import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Office task pane root was not found.');

const params = new URLSearchParams(window.location.search);
const stale = params.get('state') === 'stale';
const excel = params.get('host') === 'excel';
const hostLabel = excel ? 'EXCEL' : 'POWERPOINT';
const documentLabel = excel ? 'workbook' : 'presentation';
const connectedLabel = excel ? 'Workbook connected' : 'Presentation connected';

root.innerHTML = `
  <header class="brand"><span class="brand-mark">M</span><strong>MergeCom</strong></header>
  <main class="content">
    <p class="eyebrow">${hostLabel}</p>
    <h1>${stale ? 'A newer team version is available' : connectedLabel}</h1>
    <p class="summary">${
      stale
        ? `This ${documentLabel} was opened from version 8. The team is now on version 9.`
        : 'Working from team version 9.'
    }</p>
    ${
      stale
        ? `<div class="version-pair">
             <div><span>YOUR BASE</span><strong>Version 8</strong></div>
             <div><span>LATEST</span><strong>Version 9</strong></div>
           </div>
           <div class="actions">
             <button class="primary" data-action="inspect" type="button">Inspect conflict</button>
             <button data-action="preserve" type="button">Preserve incoming version</button>
             <button data-action="latest" type="button">Pull and open latest</button>
           </div>`
        : `<div class="status"><span aria-hidden="true"></span>Up to date</div>`
    }
    <p class="feedback" role="status" aria-live="polite"></p>
  </main>
`;

const feedback = root.querySelector<HTMLElement>('.feedback');
root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    window.dispatchEvent(
      new CustomEvent('mergecom:stale-base-action', { detail: { action } }),
    );
    if (feedback) {
      feedback.textContent =
        action === 'inspect'
          ? 'Opening conflict analysis...'
          : action === 'preserve'
            ? `Preserving this ${documentLabel} as an incoming version...`
            : 'Opening the latest team version...';
    }
  });
});
