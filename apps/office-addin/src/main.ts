import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Office task pane root was not found.');

root.innerHTML = `
  <header class="brand"><span class="brand-mark">M</span><strong>MergeCom</strong></header>
  <section class="content" aria-labelledby="foundation-heading">
    <p class="eyebrow">OFFICE TASK PANE</p>
    <h1 id="foundation-heading">Foundation connected</h1>
    <p>The shared Office add-in shell is ready. Document capture and host commands are introduced in later phases.</p>
    <div class="status"><span aria-hidden="true"></span>Phase 1 shell</div>
  </section>
`;
