import './styles.css';

import { OfficeApi, apiUrl } from './api';

const root = document.querySelector<HTMLElement>('#auth-app');
if (!root) throw new Error('Office authentication root was not found.');

root.innerHTML = `
  <header class="brand"><span class="brand-mark" aria-hidden="true">M</span><strong>MergeCom</strong></header>
  <main class="content loading-state" aria-busy="true">
    <span class="spinner" aria-hidden="true"></span>
    <p>Completing secure sign-in...</p>
  </main>
`;

void authenticate().catch(async (error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Office sign-in failed.';
  await officeReady().catch(() => undefined);
  sendToParent({ message, type: 'mergecom-office-auth-error' });
  root.innerHTML = `
    <header class="brand"><span class="brand-mark" aria-hidden="true">M</span><strong>MergeCom</strong></header>
    <main class="content">
      <h1>Sign-in failed</h1>
      <p class="feedback warning" role="alert">Close this window and try again.</p>
    </main>
  `;
});

async function authenticate(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.has('error')) {
    throw new Error('Microsoft sign-in was not completed.');
  }

  if (import.meta.env.DEV) {
    const response = await fetch(apiUrl('/auth/development/session'), {
      body: JSON.stringify({ identity: 'alpha-owner' }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw new Error('Local Office sign-in failed.');
  } else if (params.get('callback') !== '1') {
    const callbackUrl = new URL('/office-auth.html', window.location.origin);
    callbackUrl.searchParams.set('callback', '1');
    const loginUrl = new URL(apiUrl('/auth/login'));
    loginUrl.searchParams.set('returnTo', callbackUrl.href);
    window.location.replace(loginUrl.href);
    return;
  }

  const api = new OfficeApi();
  const user = await api.currentUser();
  if (!user) throw new Error('The authenticated session was not available.');
  const code = await api.createOfficeHandoff(user.session.csrfToken);
  await officeReady();
  sendToParent({ code, type: 'mergecom-office-session' });
}

function officeReady(): Promise<unknown> {
  if (typeof Office === 'undefined') {
    return Promise.reject(new Error('Office dialog APIs are unavailable.'));
  }
  return Office.onReady();
}

function sendToParent(
  message:
    | { code: string; type: 'mergecom-office-session' }
    | { message: string; type: 'mergecom-office-auth-error' },
): void {
  if (typeof Office === 'undefined') return;
  Office.context.ui.messageParent(JSON.stringify(message), {
    targetOrigin: window.location.origin,
  });
}
