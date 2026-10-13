import '../shared/wire.css';
import './landing.css';
import { DISCLAIMER, esc, topbar } from '../shared/util';
import { load, save } from '../shared/store';
import { protect, protectIfInstalled, type Protection } from '../shared/persist';

type Role = 'hunter' | 'keeper';

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
let role = await load<Role | null>('role', null);
let protection: Protection = await protectIfInstalled();
/** The player tapped Protect and the browser said no. */
let refused = false;

const TOOLS = [
  { href: 'hunters/', name: 'Hunter tracker', who: 'Each player, on their own phone', what: 'Skill tree and your own materials, plants and elements.' },
  { href: 'campaign/', name: 'Campaign tracker', who: 'The keeper', what: 'Chapters, herbalist and forge, trophies, quests and achievements.' },
  { href: 'fight/', name: 'Fight tracker', who: 'The keeper, cast to the TV', what: "Monster health, stance, struggle and states during a fight." },
];

function protectionStatus(): string {
  switch (protection) {
    case 'protected':
      return `<p class="note"><strong>Storage: protected.</strong> This browser won't clear your progress to free up space.</p>`;
    case 'unsupported':
      return `<p class="note"><strong>Storage: not protected.</strong> This browser can't keep data permanently, so back up often.</p>`;
    case 'unprotected':
      return `<div class="row">
          <button class="btn" data-act="protect">Protect my data</button>
          <span class="note"><strong>Storage: not protected.</strong> ${refused
            ? 'The browser said no. Installing the app usually fixes this.'
            : 'The browser may clear your progress when the device is low on space.'}</span>
        </div>`;
  }
}

function render(): void {
  root.innerHTML = `
    ${topbar('Primal companion tools')}
    <main class="page landing">
      <section class="box">
        <h1 class="mid">What are you doing today?</h1>
        <p class="note">This device remembers your choice. You can switch any time.</p>
        <div class="roles">
          <button class="role ${role === 'hunter' ? 'chosen' : ''}" data-role="hunter">
            <span class="mid">Track my hunter</span>
            <span class="note">Opens the hunter tracker</span></button>
          <button class="role ${role === 'keeper' ? 'chosen' : ''}" data-role="keeper">
            <span class="mid">Run the campaign and fights</span>
            <span class="note">Opens the campaign tracker, with fights from there</span></button>
        </div>
      </section>

      <section class="tools">
        ${TOOLS.map((t) => `
          <a class="box tool" href="${BASE}${t.href}">
            <span class="label">${esc(t.who)}</span>
            <span class="mid">${esc(t.name)}</span>
            <span class="note">${esc(t.what)}</span>
          </a>`).join('')}
      </section>

      <section class="box safety">
        <div class="label">Keep your progress safe</div>
        <ol>
          <li><strong>Install the app</strong> to your home screen and always open it from there.</li>
          <li><strong>Back up after each session</strong> and send the file somewhere safe.</li>
          <li>Clearing browser data or deleting the app <strong>erases your progress</strong> unless you have a backup.</li>
        </ol>
        ${protectionStatus()}
        <div class="row">
          <button class="btn" disabled>Install app</button>
          <button class="btn" disabled>Back up</button>
          <button class="btn" disabled>Restore</button>
          <span class="note">Last backed up: never · <em>coming later</em></span>
        </div>
      </section>
    </main>
    ${DISCLAIMER}`;
}

root.addEventListener('click', async (ev) => {
  if ((ev.target as Element).closest('[data-act="protect"]')) {
    protection = await protect();
    refused = protection === 'unprotected';
    render();
    return;
  }
  const btn = (ev.target as Element).closest<HTMLElement>('[data-role]');
  if (!btn) return;
  role = btn.dataset.role as Role;
  await save('role', role); // finish saving before leaving the page
  location.href = BASE + (role === 'hunter' ? 'hunters/' : 'campaign/');
});

render();
