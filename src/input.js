// Input: the keyboard, and taps on a touchscreen.
//
// Both end up in the same two objects of true/false values, so the game never
// has to care which one a player is using:
//
//   keys.left       true for as long as left is held (arrow, A, or a finger)
//   keys.r          true for as long as the R key is held
//   pressed.space   true only on the single frame space went down
//
// Use `keys` for things that happen while a key is held, like walking, and
// `pressed` for things that should happen once per press, like jumping or
// starting the level again.
//
// Every letter a to z is there, and every digit. Digits need brackets, because
// keys.1 is not something JavaScript will let you write:
//
//   keys.r        keys.x        keys['1']

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

// Friendlier names for the keys a game reaches for most. Several codes can point
// at the same name, which is how W doubles as up.
const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'space',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  Enter: 'enter',
  Escape: 'escape',
};

// The keys whose usual browser behaviour gets in the way: the arrows and space
// scroll the page, which is no good in a game.
const SCROLLS_THE_PAGE = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

// How the screen is carved up for fingers. Each band runs from the last one's
// edge up to `upTo`, measured across the screen: 0 is the far left, 1 the far
// right. So: left quarter walks left, next quarter walks right, and the whole
// right half is one big jump button.
const TOUCH_ZONES = [
  { upTo: 0.25, key: 'left' },
  { upTo: 0.5, key: 'right' },
  { upTo: 1, key: 'space' },
];

export const keys = {};
export const pressed = {};

for (const name of [...new Set(Object.values(KEY_MAP)), ...LETTERS, ...DIGITS]) {
  keys[name] = false;
  pressed[name] = false;
}

// The keyboard and the touchscreen are kept apart, then added together, because
// they can disagree: a finger lifting off the jump button must not cancel a
// space bar somebody else is leaning on.
const heldByKeyboard = new Set();
const heldByTouch = new Set();

function refresh() {
  for (const name of Object.keys(keys)) {
    keys[name] = heldByKeyboard.has(name) || heldByTouch.has(name);
  }
}

// --- Keyboard -----------------------------------------------------------------

// One key press can answer to more than one name: W is both 'up' and 'w'.
function namesFor(code) {
  const names = [];

  if (KEY_MAP[code]) names.push(KEY_MAP[code]);
  if (code.startsWith('Key')) names.push(code.slice(3).toLowerCase()); // KeyR -> r
  else if (code.startsWith('Digit')) names.push(code.slice(5)); // Digit4 -> 4

  return names;
}

window.addEventListener('keydown', (event) => {
  // Leave the browser's own shortcuts alone -- ctrl+R to reload the page is one
  // a game has no business swallowing.
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const names = namesFor(event.code);
  if (names.length === 0) return;

  for (const name of names) {
    // Holding a key down makes the browser repeat the event. Ignore the repeats,
    // so `pressed` really does mean the moment it went down.
    if (!event.repeat) pressed[name] = true;
    heldByKeyboard.add(name);
  }
  refresh();

  if (SCROLLS_THE_PAGE.has(event.code)) event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  // No modifier check here on purpose. If you press R, then hold ctrl, then let
  // go of R, this still has to hear about it -- otherwise R would be stuck down
  // for the rest of the game.
  for (const name of namesFor(event.code)) heldByKeyboard.delete(name);
  refresh();
});

// --- Touchscreen ----------------------------------------------------------------

// Which zone each finger currently on the glass is in, by the browser's id for
// that finger. A Map rather than a single value, so two fingers work: walk with
// one and jump with the other.
const fingers = new Map();

function zoneFor(x) {
  const across = x / window.innerWidth;
  for (const zone of TOUCH_ZONES) {
    if (across < zone.upTo) return zone.key;
  }
  return TOUCH_ZONES[TOUCH_ZONES.length - 1].key;
}

function rebuildTouch() {
  heldByTouch.clear();
  for (const key of fingers.values()) heldByTouch.add(key);
  refresh();
}

// Mice are left out. On a desktop the keyboard is the way in, and a stray click
// on the page making the crab leap would be baffling. Phones and tablets report
// 'touch', and so does the device emulator in the browser's developer tools.
function isFinger(event) {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

window.addEventListener('pointerdown', (event) => {
  if (!isFinger(event)) return;

  const zone = zoneFor(event.clientX);
  fingers.set(event.pointerId, zone);
  pressed[zone] = true; // so a tap on the right half counts as one jump
  rebuildTouch();
});

window.addEventListener('pointermove', (event) => {
  if (!isFinger(event)) return;
  if (!fingers.has(event.pointerId)) return;

  const zone = zoneFor(event.clientX);
  if (zone === fingers.get(event.pointerId)) return;

  // Sliding a thumb from one band into another counts as letting go of the first
  // and pressing the second, which is what makes turning round feel right.
  fingers.set(event.pointerId, zone);
  pressed[zone] = true;
  rebuildTouch();
});

function liftFinger(event) {
  if (!fingers.has(event.pointerId)) return;
  fingers.delete(event.pointerId);
  rebuildTouch();
}

window.addEventListener('pointerup', liftFinger);
window.addEventListener('pointercancel', liftFinger);

// --- Letting go of everything ----------------------------------------------------

// If the window loses focus we never get the keyup, so let go of everything.
window.addEventListener('blur', () => {
  heldByKeyboard.clear();
  heldByTouch.clear();
  fingers.clear();
  refresh();
});

// Called by the game loop once the frame is over, so each press is only seen once.
export function endFrame() {
  for (const name of Object.keys(pressed)) pressed[name] = false;
}
