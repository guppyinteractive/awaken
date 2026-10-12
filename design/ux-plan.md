# Primal Fight Tracker — UX Plan

Part of the Primal tools at `guppyinteractive.com/primal`.

Living document. Last updated: 2026-10-12.

A landscape display for **Primal: The Awakening** that tracks the monster during a fight, shown on a TV in the game room. Players keep handling cards and hunters on the table. The app only tracks the monster side of the fight.

Status: **wireframe**. Clickable grayscale layouts of every page are live at `www.guppyinteractive.com/awaken/`. The fight rules engine is real and tested; the visual design is not done yet.

---

## Goals

- Everyone at the table can read the monster's state from across the room.
- Updating it during play is quick and hard to get wrong.
- Rule-driven chains happen automatically: damage → wound → stance change → overflow.
- Mistakes are easy to fix with undo.

## Non-goals (for now)

- Tracking hunters (health, cards, KO).
- A built-in library of every monster and level. Stances are entered from the physical cards as the fight goes on.

---

## Game concepts tracked

Terms follow the rulebook (`rules/`, git-ignored). Page numbers refer to the printed rulebook.

| Concept | Notes |
|---|---|
| **Players / hunters** | 1–4. Several values scale with this. |
| **Round** | 1–10. The fight is lost if round 10 ends with the monster still alive. |
| **Health** | Starting health is set at setup: **default 10**, and the player can change it. Each wound lowers it by 1. **At 0 the monster is defeated** (p. 115). |
| **Damage** | Damage tokens on the current stance card. Builds toward toughness. |
| **Toughness** | Damage needed for one wound. Always a printed number × players (p. 113). |
| **Stance** | Stances I, II, III… The app assumes **any number of stances**. |
| **Progression value** | The health level printed on a stance card. When health reaches it, that stance is complete and the next one is revealed (p. 23). |
| **Exposed sides** | 4 sectors around the monster: front, two flanks, rear. Exposed sides are **red**, protected sides are black. The front is the **bottom** of the diagram (p. 22). |
| **Damage value** | The stance's damage. Hunters suffer it on an Unleash and from some behaviors. |
| **Struggle** | Gains 1 per player at monster upkeep. Unleashes at 3 per player. Also spent on boosts. |
| **Monster states** | Tokens on the monster, e.g. Confused and Vulnerable (glossary, pp. 104–116). |

> **Naming:** "Vulnerable" is a monster **state**. The red sides on the stance diagram are called **exposed** sides. The app keeps the two words separate.

---

## Rules logic

### Round flow

Each round has three steps. The board shows the current step:

1. **Heal**: the top of the round, when hunters can heal.
2. **Monster upkeep**: a button adds Struggle (+1 per player), checks for an Unleash, and marks upkeep as done. Until it's pressed, the button stays highlighted.
3. **End round**: clears states that end at the end of the round, advances the round marker, clears states that end at the start of the next round, and resets the upkeep flag.

If round 10 ends with the monster alive, a "Time's up" screen shows the fight was lost.

Struggle is added at upkeep instead of at end of round because the order matters in edge cases, such as hunters healing before upkeep or a state ending before it.

### Damage, wounds, and stance progression (p. 23)

- Damage is entered one hit at a time as a number.
- Wounds are applied **one at a time**. For each one:
  1. If damage ≥ toughness: health −1, and damage −toughness.
  2. If health = 0: the **monster is defeated**. Stop.
  3. If health = the stance's progression value: the **stance is complete**. Leftover damage **carries over** to the next stance.
  4. Repeat while damage ≥ the current toughness.
- **On a stance change:**
  - The board shows **STANCE CHANGE** and the next-stance form opens.
  - The damage still waiting is shown on screen ("5 damage carried over"). Damage entered while the form is open is added to it.
  - When the stance is saved, the carried-over damage is checked against the **new** toughness. That can cause more wounds or another stance change. The rulebook says to inflict that wound before any "When revealed" ability.
- **Card effects that cause a wound directly** ("the monster suffers a wound"): a **+1 wound** button lowers health by 1 without touching damage, then runs the same stance and defeat checks.
- Rulebook example (2 players, 9 health, toughness 2×, progression 7): a 13-damage hit → 2 wounds → health 7 → Stance II with 5 damage carried over. In Stance II (toughness 3× = 6), that's not enough for another wound. **This is the first test case.**

### Struggle and Unleash (p. 18)

- Each monster upkeep adds +1 Struggle per player. Extra gains, like those from some peril cards or tokens, use the manual + button.
- Manual − covers struggle spent on boosts and struggle removed by maneuver cards.
- **Unleash is checked only when the monster gains struggle.** When struggle reaches **3 × players**:
  - The board shows **UNLEASH!** and the stance's damage value ("All hunters suffer 4").
  - Struggle **resets to 1 × players** (confirmed).

### Monster states

**Built now: Confused and Vulnerable.** Others can be added later the same way.

Each state has:
- **When it ends:** *end of this round*, *start of next round*, or *only when removed*.
- **Limit:** whether the monster can have more than one at a time.
- **Hint:** a short summary in our own words, plus the rulebook page. Tap the chip to see it.

| State | Ends | Limit | What the app does |
|---|---|---|---|
| **Confused** | Start of next round, or earlier when it cancels a boost | One | Chip on the board. Tap → hint, or **Remove** (it was used to cancel a boost). |
| **Vulnerable** | End of this round, or earlier when used | One. Can't be added while the monster already has it. | Chip on the board. Hit entry offers **"×2, use Vulnerable"**, which doubles that one hit and removes the chip. It can't be used on the hit that applied it. |

- Players use and remove states whenever they like during the round. End Round only clears whatever is left.
- **Later candidates** (for the hints list):
  - **Stun**: one behavior card can't trigger this round.
  - **Hardened**: see below.
  - **Unstoppable**: +1 struggle each time a behavior triggers.
  - Blind sits on peril cards, not the monster, so it's probably out of scope.
- **Hardened changes the damage rules:** after each wound, *all* remaining damage is removed, so nothing carries over. Hardened monsters also can't be stunned, confused, or made vulnerable. If we add Hardened, the damage logic and the state buttons need to respect it.

### Hint text and IP

- Hints are **one or two sentences in our own words** plus a rulebook page reference, e.g. *"Discard to double one hit. Removed at end of round. (Rulebook p. 114)"*.
- Never paste rulebook text.

---

## Stance entry

Stances are **not** entered in advance. Monster level changes the stance progression, so each stance is copied from its card when it's revealed. There can be any number of stances.

**New fight:** monster name, player count, starting health (**default 10**, editable for special cases), and difficulty tier (shown as a reminder). Then the Stance I form.

**Stance form fields** (matching the stance card):

- Label: automatic (I, II, III…), can be edited
- Toughness: the printed number; the app multiplies it by players (default 2)
- **Next stance at health** (the card's progression value): the health at which this stance completes. Leave it blank if the stance lasts until the monster is defeated.
- **[Monster] attack damage** (the card's damage value)
- Exposed sides: tap sectors on the diagram to turn them red

The current stance can be edited at any time to fix typos. Edits re-check wounds right away.

---

## Screens

### Board (landscape)

```
┌──────────────────────────────────────────────────────────────┐
│ MONSTER NAME    Stance II              Round ●●●●○○○○○○ 4/10│
│                                         Step: Monster upkeep │
├────────────────────────────┬─────────────────────────────────┤
│ HEALTH  ■■■■■■■□□  7       │          Exposed sides          │
│   next stance at 5         │              REAR               │
│                            │           ╱ ░░ │ ░░ ╲           │
│ DAMAGE  ▓▓▓▓▓░  5 / 6      │    FLANK  │────┼────│  FLANK    │
│   toughness 6 (3 × 2)      │           ╲ ▓▓ │ ▓▓ ╱           │
│                            │              FRONT              │
├────────────────────────────┼─────────────────────────────────┤
│ STRUGGLE ▓▓▓▓░░ 4 / 6      │  ATTACK DAMAGE 4                │
│   Unleash at 6             │  [CONFUSED ⓘ] [VULNERABLE ⓘ]    │
└────────────────────────────┴─────────────────────────────────┘
```

- Big numbers, high contrast, dark theme, readable from the couch.
- **Health** counts down. Marks on the health track show where each stance starts.
- **Exposed sides diagram:** a circle in 4 sectors, with the front at the **bottom**, matching the stance cards. Exposed sectors are **red**, protected sectors are dark.
- **State chips:** tap one for its hint and a Remove button.
- **Full-screen announcements** for 2–3 seconds, with optional sound: **WOUND!**, **STANCE CHANGE**, **UNLEASH!**, **MONSTER DEFEATED**, **TIME'S UP**.
- **Waiting banner** while the next stance is being entered: "Stance change: enter Stance III… 5 damage carried over."
- The screen should stay awake (wake lock, where the device allows it).

### Board (portrait)

For the keeper holding a phone or tablet upright when it isn't being cast. The same pieces stack into one column, most important first:

```
┌───────────────────────────┐
│ MONSTER NAME              │
│ Stance II · Round 4/10    │
│ Step: Monster upkeep      │
├───────────────────────────┤
│ HEALTH  ■■■■■■■□□  7      │
│   next stance at 5        │
│ DAMAGE  ▓▓▓▓▓░  5 / 6     │
├───────────────────────────┤
│ STRUGGLE ▓▓▓▓░░ 4 / 6     │
├─────────────┬─────────────┤
│ exposed (○) │ DMG VALUE 4 │
├─────────────┴─────────────┤
│ [CONFUSED ⓘ] [VULN ⓘ]     │
├───────────────────────────┤
│ Upkeep · End round · Undo │
└───────────────────────────┘
```

- The bottom action bar stays fixed and within reach of a thumb.
- When casting, the app suggests turning the device sideways, because a portrait cast leaves black bars on a TV. It only suggests this and never forces it.

### Built-in controls (same surface)

There is one page, and its controls are part of the board. Whatever is on screen is what gets cast, so the controls have to look fine on the TV:

- **Tap the thing to change it:** tap damage to open hit entry, tap a sector to toggle it, tap Struggle for +/−, and tap a state chip for its hint and Remove.
- **Quiet styling:** controls are low-contrast and grouped along the edges, so the numbers stay the focus from across the room.
- **Main actions** sit in a slim bottom bar: **Monster upkeep (+N)**, **End round**, **Undo**.
- **Hit entry:** a small popover with +1 to +6, a custom amount with **Deal**, **×2 (use Vulnerable)** when the monster is vulnerable, and −1 for corrections. It closes after a hit, so the TV shows the result.
- **States:** **+ Confused** and **+ Vulnerable** buttons. Each is disabled when the monster already has that state, or when a state like Hardened blocks it.
- **Stance form:** a full-screen panel, which also shows on the TV. That's fine, because the whole table is waiting on the stance change anyway.
- **Less frequent actions** go in a menu: New fight, Edit stance, **+1 wound (card effect)**, manual health +/−, and the log.
- **Log:** the last ~15 actions, e.g. "Hit 13 → 2 wounds, Stance II, 5 carried over". It's kept in the menu, not on the board.

Touch targets need to work from a laptop trackpad, a tablet, or a phone, upright or sideways.

### Undo and log

- Every action can be undone, including whole chains: undoing a big hit reverses its wounds and any stance change it caused.
- Using Vulnerable on a hit is undone together with that hit.
- Keep the last ~30 actions.

---

## Display and casting

**Decision:** one web page, cast to the TV from whichever device is running it.

- The device running the page (laptop, tablet, or phone) controls the fight. The TV shows a mirror of it through tab casting or screen mirroring.
- **No second controller surface and no network sync.** If a phone is used, it shows the same page, not a separate remote.
- All state lives in the running page and is saved on the device (see Hosting and persistence).
- **Usual device:** a phone or tablet, so touch comes first.
- **Layout target:** 16:9 landscape for casting, with portrait as a full layout too (see Board (portrait)). It has to work from phone-landscape (~800 × 390) up to a tablet, upright or sideways.

TV hardware is still undecided (Chromecast / Google TV, a smart TV browser, or a laptop over HDMI). The single-page approach works with any of them.

---

## What to track (from the sheets)

Taken from photos of the hunter and campaign sheets, which are kept in `design/reference/` and git-ignored. The app uses the **component names as printed on the sheets** (materials, plants, elements, trophy monsters) as plain labels, so players never type them in. It never uses game art, icons, logos, or rules text.

### Hunter tracker (one per player)

| Field | Kind | Changes when |
|---|---|---|
| Player name | Text | Setup |
| Class | Text | Setup |
| **Skill tree** | 5 rows (A–E), each with a tier 1 and a tier 2 step. Each step is a simple yes/no: has the hunter gained those cards? The card slots and colors on the sheet don't need tracking. | Between fights (level-up) |
| **Materials** | 6 kinds, a count for each. The hunter's own pool. | After fights, when crafting |
| **Plants** | 6 kinds, a count for each. The hunter's own pool. | After fights, at the herbalist |
| **Elements** | 9 kinds, a count for each. The hunter's own pool. | After fights, when crafting |
| Notes | Free text | Any time |

Out of scope for now: gear (weapon, helm, armor, item, potions) and anything from the hunter board (health during a fight, KO). Players keep using the physical components for these.

### Campaign tracker (keeper)

| Field | Kind | Changes when |
|---|---|---|
| **Chapters** | 11 in order, marked as completed. The markers at chapters 1, 4 and 8 start a new difficulty tier, which decides which stance and peril cards to use. It matters only at setup. | After each chapter |
| **Herbalist level** | 1–3 | Upgrades between fights |
| **Forge level** | 1–3 | Upgrades between fights |
| **Forge elements** | The same 9 element kinds as the hunter sheet. Each is yes/no: is that element's forge unlocked? | Between fights |
| **Trophies** | One mark per monster defeated, for the sheet's 22 monsters. Each has a **Fight** shortcut that starts a fight with it. | After winning a fight |
| **Quests** | Numbered 1–49, marked when done | During the campaign |
| **Achievements** | Free-text list (about 7 lines on the sheet) | During the campaign |

Out of scope for now: the Hunter's Trial (Valor, defeat track). It doesn't seem to be part of the normal campaign.

### Links between tools (keeper's device)

- **Win a fight:** mark the trophy and offer to complete a chapter or quest.
- **Start a fight from a campaign:** pick from the trophy list of monsters. Fight setup also suggests the monster names as you type.
- **Fight setup hint:** when starting a fight from a campaign, show the current difficulty tier (1–3, from the chapter) as a reminder of which stance and peril cards to use. It's only shown for reference; the app doesn't enforce anything.
- Rewards like materials go to each hunter's own pool on that player's phone. Each player adds their own; there's no sync.

### Names and game content

- Materials (6), plants (6), elements (9), and the trophy monsters (22) ship with the app, **using the names from the sheets** (`src/shared/game.ts`).
- Names are plain text labels. No game icons or art; any icons are our own generic shapes.
- Rules hints stay in our own words with a page reference, never pasted text.

---

## Product family

`guppyinteractive.com/primal` is a small set of Primal companion tools, with the fight tracker first.

| Tool | Path (draft) | Status |
|---|---|---|
| **Catalog / landing** | `/primal` | Planned. Lists the tools, offers installing, links to backup and restore. |
| **Fight tracker** | `/primal/fight` | Planning (this document). |
| **Hunter tracker** | `/primal/hunters` | Idea. Used by each player on their own phone. |
| **Campaign tracker** | `/primal/campaign` | Idea. Used by the keeper. |

### Roles: one app, different devices

There is one app, and each device uses the parts its owner needs. State stays **separate on each device**; nothing syncs between them.

| Role | Typical device | Uses |
|---|---|---|
| **Hunter player** (usually 3 of 4) | Their own phone | Hunter tracker only, for their own hunter |
| **Keeper** (1 player) | Phone or tablet, cast to the TV | Campaign tracker + fight tracker, plus their own hunter |

- The landing page asks what you're doing ("Track my hunter" / "Run the campaign and fights") and then **opens straight to that tool next time**. Switching is always one tap away.
- A hunter player never has to see campaign or fight screens.
- One device can hold **several hunters** (solo play, someone running two hunters, or a group using a single device).

### Layout and orientation (all tools)

Every tool works well **upright and sideways**, on phones and tablets. Neither is a cut-down version of the other.

| Tool | Main orientation | Other orientation |
|---|---|---|
| **Fight tracker** | Landscape (cast to the TV) | Portrait: stacked board for handheld use |
| **Hunter tracker** | **Portrait** (phone in hand at the table) | Landscape: two columns, e.g. stats beside cards and gear |
| **Campaign tracker** | Either | Either |
| **Landing page** | Either | Either |

- Layout follows the screen's shape and size, never a forced orientation lock.
- Rotating mid-fight keeps everything: open popovers, half-entered numbers, and scroll position.
- Key numbers stay large in both orientations. Portrait stacks the content; it doesn't shrink it.
- Fixed bars respect phone notches and home indicators (safe areas).
- Test sizes: small phone (~360 × 640), large phone, 7–8" tablet, 11–13" tablet, and a 16:9 TV cast, each upright and sideways.

### Shared across tools

- **One app, one store on each device:** all tools save to the same IndexedDB, but the data is split by kind (hunters, campaigns, fights). On the keeper's device a campaign can link to its fights. For example, starting a fight from a campaign fills in the monster, level, and player count.
- **No cross-device dependency:** the fight tracker needs only the player count from the hunters, which the keeper enters. It never needs hunter data from other phones.
- **Backup:** export everything, or a single hunter, campaign, or fight.
- **Possible later:** a player shares a hunter summary (name, level) to the keeper's campaign by QR code. This is a one-time copy, not a sync.
- **One look:** shared design tokens, type, and components, so the tools feel like one app.
- **One footer disclaimer:** *Unofficial fan-made tool. Not affiliated with or endorsed by the publisher of Primal: The Awakening.* No publisher art, icons, logos, or rules or card text. Component names from the sheets are used as plain labels.

### Design implication for the fight tracker

Keep the fight's data self-contained, with optional links (campaign id, hunter ids) to fill in later. The fight tracker has to work completely on its own.

---

## Hosting and persistence

"Multi-user" means **many separate play groups**, and many devices within a group, each holding its own state. Nothing syncs between devices (see Roles).

### Hosting

- Served at **`guppyinteractive.com/primal`**. That page is a **catalog landing page** for a family of Primal tools (see Product family below). The fight tracker gets its own path, e.g. `guppyinteractive.com/primal/fight`.
- Hosted on **GitHub Pages** under the **guppyinteractive** org. A repo named `primal` in the org is served at `/primal` automatically once the org's Pages site uses the `guppyinteractive.com` custom domain.
- No backend, no user accounts, no cost. Every group opens the same URL, and no group can see another's data.

### Installable app (PWA)

- One installable app for the whole `/primal/` path, so the landing page and every tool share one home-screen icon, one offline cache, and one store of saved data.
- Add to Home Screen gives an app icon and a full-screen view with no browser bar, which casts cleanly.
- Works **offline** once loaded, because a service worker caches the app.
- The app should **encourage installing it**, because installed apps are much less likely to have their data cleared (see below).

### Saving on the device

- Fights are saved in **IndexedDB** on the device after every action, so a refresh, crash, or closed tab never loses one.
- The app asks the browser to keep its data permanently (`navigator.storage.persist()`).
- Known risk: **Safari on iPhone and iPad can delete data for sites not used in about 7 days** unless the app is installed to the home screen. See **Data safety** for the full list of risks and fixes.

### Backup and transfer

- **Export and import** a fight (or all saved data) as a small JSON file.
- **QR code / share link** holding a fight snapshot, to move it to another device.
- This also covers recovery if the browser clears its data.

### Features this enables

- **Saved fights list:** pause and resume several, e.g. "<monster> · Level 2 · Round 6". Delete or archive finished fights.
- **Custom states remembered** on each device.
- *Later, maybe:* fight history (wins and losses, rounds taken).

### Deferred: cross-device sync

If it's ever needed, an optional "cloud save code" could do it: a tiny Cloudflare Worker that stores data under a random code like `TUSK-4821`. Still no accounts. Not planned until someone asks for it.

---

## Data safety

Everything is saved only in the browser on each device, so the app itself has to protect players from losing progress.

### Risks

| # | Risk | Who causes it | Data | Main fix |
|---|---|---|---|---|
| 1 | Clearing browsing or site data | Player | **Lost** | Backups |
| 2 | Deleting the installed app (iOS deletes its data; Android often does) | Player | **Lost** | Backups, and a warning in help |
| 3 | Private or incognito browsing | Player | **Lost** when the tab closes | Detect it and warn |
| 4 | New, lost, or reset device (site data isn't reliably backed up or synced) | Player | **Lost** | Backups |
| 5 | Safari deletes data after ~7 days unused, unless the app is installed | Browser | **Lost** | Install early |
| 6 | Browser clears data when the device is low on storage | Browser | **Lost** | Ask for permanent storage |
| 7 | Opened in a different browser, a Safari tab vs. the installed app, or a chat app's built-in browser | Player | Still there, but **looks lost** | Detect in-app browsers; explain each copy is separate |
| 8 | The site address changes (data is tied to the address) | Us | **Stranded** | Launch on the final address and never move it |
| 9 | An app update breaks the saved data format | Us | **Corrupted** | Versioned data and tested upgrades |
| 10 | Two tabs open at once overwrite each other | Player | **Partly lost** | Allow only one active tab |

### What the app does

**Prevention**
- **Install early:** the landing page pushes "Add to Home Screen" *before* any data exists. On iOS that avoids both the 7-day deletion (5) and the tab-vs-installed-app split (7).
- **Permanent storage:** the app asks the browser to keep its data permanently (`navigator.storage.persist()`) and shows whether the browser agreed.
- **Risky places:** detect private mode and in-app browsers (Discord, Messenger, etc.) and show a banner: "Progress won't be saved here. Open in your browser or install the app."
- **One active tab:** a second open tab shows "Open in another tab" and a **Use here** button, instead of both saving.

**Backup**
- Show **"Last backed up N days ago"** on the landing page and in the menu. It turns to a warning after ~7 days with unsaved changes.
- **Nudge to back up** after a fight ends and after a chapter is completed.
- **Export through the phone's share sheet** (falling back to a file download), so a backup can go to Files, Drive, email, or the group chat.
- Export everything, or a single hunter, campaign, or fight. Import shows a preview and asks before replacing anything.

**Recovery**
- **Automatic copies on the device:** keep the last few versions of each campaign and hunter (e.g. one per session), so a bad update or a mistake can be rolled back. These copies don't survive the browser clearing its data; only exports do.

**Our discipline**
- **The address is permanent:** `guppyinteractive.com/primal` from the first public release. Never ship on a temporary address (8).
- **Versioned data:** every saved record carries a version number. Each app update upgrades old data step by step, with tests that use saved examples of every past version (9).
- **Before upgrading, save a copy:** keep a copy of the data from before the upgrade until the new version has loaded it successfully.
- **Backups always import:** an export from any past version still imports into the current one.

### What players are told

A short "Keep your progress safe" note on the landing page and in help:

1. **Install the app** to your home screen and always open it from there.
2. **Back up after each session.** Send the file somewhere safe, like Drive or your group chat.
3. Clearing browser data or deleting the app **erases your progress** unless you have a backup.

The only risk left is a player clearing their data with no recent backup. A synced save code (see Deferred: cross-device sync) would close that gap if it ever matters.

---

## Open questions

Tracked as decision issues in Beads (`bd list --type=decision`). Record the answer here and in the decision log when one closes.

- [ ] Do the extra tracks some monsters have (e.g. charge or hardening tracks) belong on the board? Hardened changes the damage rules (see Monster states).
- [x] Is `guppyinteractive.com` already pointed at GitHub Pages? Yes: www.guppyinteractive.com/awaken/ is live.
- [ ] Does the keeper role need a name in the app ("Keeper", "Lead", "Host")?
- [ ] Names and icons for the suite and the fight tracker. ("Awaken" is the repo and folder name.)
- [ ] Should the TV show anything about hunters, such as KO count?

## Decision log

| Date | Decision |
|---|---|
| 2026-10-12 | ~~Landscape TV board + separate phone controller.~~ Replaced (see below). |
| 2026-10-12 | Struggle is added at monster upkeep, not at end of round. |
| 2026-10-12 | Stances are entered when they come up, not stored per monster or level. |
| 2026-10-12 | Overflow damage carries into the next stance once it's entered, and can chain. |
| 2026-10-12 | One hit can cause multiple wounds. |
| 2026-10-12 | ~~Reaching the final stance's threshold defeats the monster.~~ Replaced: health counts down, and the monster is defeated at 0 (rulebook p. 115). |
| 2026-10-12 | 4 sectors in a circle, exposed ones in red, front at the bottom (like the stance cards). Facing isn't tracked. |
| 2026-10-12 | After an Unleash, Struggle resets to 1 × players (rulebook p. 18). |
| 2026-10-12 | One web page with built-in controls, cast or mirrored to the TV. No separate phone remote and no sync. |
| 2026-10-12 | The usual device is a phone or tablet, so the design is touch-first. |
| 2026-10-12 | Multi-user means separate groups, each on their own device. No shared state between devices. |
| 2026-10-12 | Static PWA on GitHub Pages under the guppyinteractive org. IndexedDB saving on the device, JSON/QR export and import as the backup. No backend or accounts. |
| 2026-10-12 | Host at guppyinteractive.com/primal as a catalog landing page. The fight tracker is the first tool; character and campaign trackers may follow. |
| 2026-10-12 | All tools share one origin, one installable app, one data store, and one backup. |
| 2026-10-12 | One app with roles. Players use the hunter tracker on their own phones; one keeper runs the campaign and fights. Each device keeps its own state, with no sync. |
| 2026-10-12 | Every tool has full portrait and landscape layouts. Hunter tracker is portrait-first; fight tracker is landscape-first with a stacked portrait layout. |
| 2026-10-12 | Sheet photos kept in git-ignored `design/reference/`. ~~The app ships unnamed slots that players name.~~ Replaced (see below). |
| 2026-10-12 | Skill tree steps and forge elements are yes/no. Each hunter keeps their own resource pool. |
| 2026-10-12 | Out of scope for now: the Hunter's Trial, gear, and the hunter board. |
| 2026-10-12 | The chapter markers (1, 4, 8) set the difficulty tier. It's shown only as a reminder at fight setup. |
| 2026-10-12 | Model aligned with the rulebook: health counts down, toughness is a number × players, progression value, damage carries over between stances, any number of stances. |
| 2026-10-12 | Build only Confused and Vulnerable for now. States have an end timing, a limit, and a tap-to-read hint in our own words with a page reference. Vulnerable doubles one hit from hit entry. |
| 2026-10-12 | Rulebook and FAQ PDFs kept in git-ignored `rules/`. |
| 2026-10-12 | Starting health defaults to 10, and the player can change it at setup. |
| 2026-10-12 | Data safety: install early, ask for permanent storage, "last backed up" reminders, export through the share sheet, automatic copies on the device, versioned data, one active tab, and a permanent address from first release. |
| 2026-10-12 | One repo, `guppyinteractive/awaken`, holds every tool. Local folder renamed from `pft` to `awaken`. |
| 2026-10-12 | Stack: Vite + TypeScript, no UI framework yet. Multi-page build (landing, fight, hunters, campaign) under base `/awaken/`. Fight rules are pure functions in `src/engine/` with Vitest tests. |
| 2026-10-12 | Deploy: GitHub Actions tests, builds, and publishes `dist/` to Pages. Only the built app is served; design docs stay in the repo. |
| 2026-10-12 | The wireframe saves to localStorage. The real app moves to versioned IndexedDB (see Data safety). |
| 2026-10-12 | Use the sheets' component names (materials, plants, elements, 22 trophy monsters) as built-in labels. Players don't type them. Still no art, icons, logos, or rules text. |
| 2026-10-12 | Plain labels on screen: "Next stance at health" (the card's progression value) and "[Monster] attack damage" (its damage value). Tapping "Next stance at N" on the board opens the stance editor. |
