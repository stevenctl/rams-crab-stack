// ---------------------------------------------------------------------------
// THE GAME. This is the file to play with.
//
// The crab is stuck in a tank. Drumsticks keep raining in and piling up in one
// corner. Climb the pile, get over the glass, and you have escaped -- and the
// next tank is taller.
//
// You can eat the drumsticks too, and each one leaves a bone you can shove
// around. But every drumstick you eat is a rung off your ladder, so eating is a
// choice rather than something that just happens.
//
//   start(world)      runs once at the beginning, and again after world.reset()
//   update(world, dt) runs every frame (about 60 times a second)
//
// `dt` is how many seconds passed since the last frame. Multiplying by dt is
// what keeps movement smooth and the same speed on every computer.
//
// The crab is really a flat rectangle called `world.player`, and the 3D model is
// drawn on top of wherever that rectangle is. So this file is plain 2D: x is
// across, y is up, and that's it.
//
//   world.player.x / .y     where the crab is (x = middle, y = feet)
//   world.player.vx / .vy   how fast it is moving, in units per second
//   world.player.onGround   true when standing on something solid
//   world.keys.left         true while held. Every letter works too: keys.e
//   world.pressed.space     true only on the frame the key went down
//   world.play('Walking')   'Idle', 'Walking' or 'Eating'
//   world.playAudio('chomp')
//   world.hud('hello')      text in the corner of the screen
//   world.gravity           how hard things fall. Try -10 for the moon
//   world.reset()           empty the world and run start() again
//
//   world.tank(width, height)   sand at y = 0, glass at both ends
//   world.ledge(x, y, width)    a thin shelf
//   world.rock(x, y, w, h)      a chunky block
//   world.spawn('Bone', { ... }) anything else with a model
//
//   crab.colliding('snack', (snack) => { ... })    every one being touched
//   crab.collidingOne('snack')                     just the first, handed back
// ---------------------------------------------------------------------------

// Knobs to twiddle. Change a number, save the file, watch what happens.
const SPEED = 7; // how far the crab walks in one second
const JUMP = 13; // how hard it pushes off the ground
const CHEW_TIME = 0.75; // how many seconds a drumstick takes to eat
const DROP_EVERY = 2.0; // a new drumstick falls in this often, in seconds

// Fall below this and you are out of the tank and away. The sand's top is y = 0,
// so nothing that is still inside can ever get down here.
const ESCAPED_BELOW = -5;

const TANK_WIDTH = 24; // the tank is always this wide
const FIRST_HEIGHT = 8; // how tall the glass is on level 1
const TALLER_EACH_LEVEL = 3; // and how much taller it gets after each escape

// Where the drumsticks come down. They land in a narrow band rather than all
// over, so they pile into something climbable instead of scattering flat.
const PILE_AT = TANK_WIDTH / 2 - 4;
const PILE_SPREAD = 2;

// Things worth remembering between levels. These survive world.reset(), which is
// how the game gets harder: start() reads `level` and builds a taller tank.
let level = 1;
let escapes = 0;
let eaten = 0;

// Things belonging to the level being played right now. start() clears these, so
// nothing from the last level can leak into the next one.
let glassHeight = 0;
let levelTime = 0;
let nextDrop = 0;
let chewing = [];
let escaped = false;

export function start(world) {
  levelTime = 0;
  nextDrop = 0.5; // the first drumstick lands almost straight away
  chewing = [];
  escaped = false;

  glassHeight = FIRST_HEIGHT + (level - 1) * TALLER_EACH_LEVEL;
  world.tank(TANK_WIDTH, glassHeight);

  // A rock to give the first climb a leg-up.
  world.rock(PILE_AT - 5, 0, 3, 2);

  showHud(world);
}

export function update(world, dt) {
  const crab = world.player;
  levelTime += dt;

  // --- Walking. The speed is set from scratch every frame, so letting go of the
  //     key means a speed of zero, which means stop.
  crab.vx = 0;
  if (world.keys.left) crab.vx = -SPEED;
  if (world.keys.right) crab.vx = SPEED;

  // --- Jumping. One burst of upward speed; gravity draws the rest of the arc by
  //     itself. `pressed` rather than `keys`, so holding the key down does not
  //     make the crab bounce like a spring.
  if (world.pressed.space && crab.onGround) {
    crab.vy = JUMP;
  }

  // --- Start the level over. `pressed` again: with `keys` it would reset on
  //     every frame the key was held, and the game would never get going.
  if (world.pressed.r) {
    world.reset();
    return;
  }

  dropDrumsticks(world);
  startEating(world, crab);
  finishEating(world);
  checkEscape(world, crab);

  // --- Whichever animation matches what the crab is doing.
  if (chewing.length > 0) {
    crab.play('Eating');
  } else if (crab.vx !== 0) {
    crab.play('Walking');
  } else {
    crab.play('Idle');
  }
}

// --- Winning ------------------------------------------------------------------
//
// You have escaped when you fall off the outside of the tank. Climb the pile,
// get over the glass, walk off the rim, and drop.
//
// Falling this far can only mean you are out: the sand is exactly as wide as the
// tank, so inside it there is always floor under you at y = 0, and the only place
// with nothing underneath is beyond the glass.
function checkEscape(world, crab) {
  if (escaped) return; // only once, however far we fall afterwards
  if (crab.y > ESCAPED_BELOW) return;

  escaped = true;
  escapes += 1;
  level += 1;

  world.playAudio('winsound');
  world.hud(`ESCAPED!\nTank ${level} is taller...`);

  // Leave the message up for a moment. Nothing else can happen in between,
  // because `escaped` is now true and the reset is already on its way.
  world.reset();
}

// Drop a drumstick in from above every so often.
//
// This counts seconds in update() rather than using setTimeout. A timer set with
// setTimeout keeps running after the level has been thrown away, so resetting
// would leave the old level's timers dropping food into the new one -- and every
// reset would start another set on top, until the tank filled with chicken.
function dropDrumsticks(world) {
  if (escaped) return;
  if (levelTime < nextDrop) return;
  nextDrop = levelTime + DROP_EVERY;

  world.spawn('Drumstick', {
    x: PILE_AT + (Math.random() * 2 - 1) * PILE_SPREAD,
    y: glassHeight + 6, // in over the top of the glass
    z: -1 + Math.random(), // scattered a little in depth, purely to look at
    size: 5.2,
    rotation: 90, // lying on its side, so it stacks flat
    collider: 0.6, // a smaller box than the model, so climbing feels fair
    tag: 'snack',
    solid: true, // so they pile up on each other, and can be stood on
    moves: true, // so they fall
  });
}

// Take a bite, but only when asked. If this happened on contact instead, the
// crab would eat the pile out from underneath itself on the way up.
function startEating(world, crab) {
  if (!world.pressed.e) return;

  crab.colliding('snack', (snack) => {
    if (snack.beingEaten) return; // already working on this one
    snack.beingEaten = true;

    world.playAudio('chomp');
    chewing.push({ snack, doneAt: levelTime + CHEW_TIME });
  });
}

// Anything the crab has finished chewing turns into a bone.
function finishEating(world) {
  // Walk the list backwards, because we remove from it as we go.
  for (let i = chewing.length - 1; i >= 0; i--) {
    const { snack, doneAt } = chewing[i];
    if (levelTime < doneAt) continue;

    world.spawn('Bone', {
      x: snack.x,
      y: snack.y,
      z: snack.z,
      size: 5.2,
      rotation: 90,
      collider: 0.9, // bones are nearly their full size, so they stack solidly
      tag: 'bone',
      pushable: true, // leftovers can be shoved around the tank
    });

    world.remove(snack);
    chewing.splice(i, 1);

    eaten += 1;
    showHud(world);
  }
}

function showHud(world) {
  world.hud(
    `Tank ${level}   glass is ${glassHeight} high   escaped ${escapes}   eaten ${eaten}\n`
    + 'Climb the pile of drumsticks and get over the glass!\n'
    + 'Arrows to walk, space to jump, E to eat, R to start over',
  );
}
