import '../shared/wire.css';
import './landing.css';
import { DISCLAIMER, KEYS, esc, load, save, topbar } from '../shared/util';

type Role = 'hunter' | 'keeper';

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
let role = load<Role | null>(KEYS.role, null);

const TOOLS = [
  { href: 'hunters/', name: 'Hunter tracker', who: 'Each player, on their own phone', what: 'Skill tree and your own materials, plants and elements.' },
  { href: 'campaign/', name: 'Campaign tracker', who: 'The keeper', what: 'Chapters, herbalist and forge, trophies, quests and achievements.' },
  { href: 'fight/', name: 'Fight tracker', who: 'The keeper, cast to the TV', what: "Monster health, stance, struggle and states during a fight." },
];

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

root.addEventListener('click', (ev) => {
  const btn = (ev.target as Element).closest<HTMLElement>('[data-role]');
  if (!btn) return;
  role = btn.dataset.role as Role;
  save(KEYS.role, role);
  location.href = BASE + (role === 'hunter' ? 'hunters/' : 'campaign/');
});

render();
