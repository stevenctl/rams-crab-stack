// ---------------------------------------------------------------------------
// A very small 2D physics engine: gravity and boxes that you can't walk through.
//
// Every solid thing in the game is a rectangle ("AABB" -- an axis-aligned
// bounding box, which just means a rectangle that never rotates). Nothing here
// knows about 3D at all.
//
// Positions use this convention:
//
//        x is the MIDDLE of the box       +--------+
//        y is the BOTTOM of the box       |        |  height
//                                         +---()---+
//                                          width
//
// so `y` is the height of the floor the box is standing on. Handy, because
// standing on the ground is just y === 0.
// ---------------------------------------------------------------------------

// A hair of space to leave between two things when we shove them apart. Left
// exactly touching, rounding can still read them as overlapping, and then they
// argue with each other forever.
const SKIN = 0.001;

export function createBody(x, y, width, height) {
  return {
    x,
    y,
    width,
    height,
    vx: 0, // speed sideways, in units per second
    vy: 0, // speed upwards, in units per second
    onGround: false, // true when standing on something solid
    facing: 1, // 1 = looking right, -1 = looking left
  };
}

// Do two boxes overlap? `slack` grows the first box a little on every side,
// which is how "resting against" can be made to count as a hit.
export function overlaps(a, b, slack = 0) {
  return (
    a.x - a.width / 2 - slack < b.x + b.width / 2 &&
    b.x - b.width / 2 < a.x + a.width / 2 + slack &&
    a.y - slack < b.y + b.height &&
    b.y < a.y + a.height + slack
  );
}

// Are two things in contact? This is the one for gameplay -- eating, collecting,
// standing on a button -- rather than for the physics.
//
// It has to be a shade more generous than overlaps(), because the physics leaves
// things that have bumped into each other a hair apart on purpose (see SKIN).
// Without that, walking into something solid would push you clear of it, and it
// would never register as touched: the crab would nudge a drumstick around the
// tank forever without ever managing to take a bite.
export function touching(a, b) {
  return overlaps(a, b, SKIN * 4);
}

// Try to shove a pushable thing sideways. It only moves if there is somewhere
// for it to go: shove it against the glass, or against another box, and it stays
// put -- and then whoever was pushing it gets stopped instead.
//
// One box at a time. You cannot shove a whole row of them along at once, the
// same rule crates follow in most puzzle games.
function push(box, distance, solids, pusher) {
  const startedAt = box.x;
  box.x += distance;

  for (const other of solids) {
    if (other === box || other === pusher) continue;
    if (!overlaps(box, other)) continue;

    box.x = startedAt; // nowhere to go
    return false;
  }

  return true;
}

// Move a body by its speed, then push it back out of anything solid it landed
// inside. We do the two directions separately -- first sideways, then up/down --
// because that makes it obvious which side we hit, so we know which way to push.
export function step(body, solids, gravity, dt) {
  // Gravity is an acceleration: it changes speed, and speed changes position.
  body.vy += gravity * dt;

  // --- Sideways ---
  body.x += body.vx * dt;

  // Which way we were going as this frame began. Worked out once, up here,
  // because the moment we bump into the first thing we set our speed to zero --
  // and then every other thing we are touching would be judged as if we had
  // been standing still.
  const wasGoingX = body.vx;

  for (const solid of solids) {
    if (solid === body) continue; // a solid thing that moves must not hit itself
    if (!overlaps(body, solid)) continue;

    // Which side did we go in from? Usually the way we were moving tells us. But
    // the game is allowed to move things by setting body.x itself, and then there
    // is no speed to read -- so fall back to whichever side we are nearer to.
    const cameFromTheLeft = wasGoingX > 0 || (wasGoingX === 0 && body.x < solid.x);

    // How far we have sunk into it -- which is how far it would have to shift to
    // be out of our way again, plus a hair so they end up properly apart rather
    // than exactly touching.
    const sunkIn = cameFromTheLeft
      ? body.x + body.width / 2 - (solid.x - solid.width / 2) + SKIN
      : body.x - body.width / 2 - (solid.x + solid.width / 2) - SKIN;

    // If it is something that can be shoved along, try shoving it rather than
    // stopping dead. If it goes, we carry on walking as though it were not there.
    if (solid.pushable && push(solid, sunkIn, solids, body)) continue;

    // Stop a hair short rather than exactly touching. Exactly touching has to
    // survive a rounding error to still count as "not overlapping", and when it
    // does not, the up-and-down pass below sees a sliver of overlap and thinks
    // we are standing on the thing we just walked into.
    if (cameFromTheLeft) {
      body.x = solid.x - solid.width / 2 - body.width / 2 - SKIN; // hit its left side
    } else {
      body.x = solid.x + solid.width / 2 + body.width / 2 + SKIN; // hit its right side
    }
    body.vx = 0;
  }

  // --- Up and down ---
  body.onGround = false;
  body.y += body.vy * dt;

  // Sampled once, for the same reason: landing on the sand sets our falling
  // speed to zero, and anything else we happen to be touching -- a bone resting
  // beside us, say -- must not be judged by that zero.
  const wasGoingY = body.vy;

  for (const solid of solids) {
    if (solid === body) continue;
    if (!overlaps(body, solid)) continue;

    // The same question going up and down, answered the same way.
    const cameFromAbove = wasGoingY < 0 || (wasGoingY === 0 && body.y > solid.y);

    if (cameFromAbove) {
      // Landing sits exactly on the surface, on purpose. Every frame gravity
      // sinks us a whisker into the floor and this lifts us back out, and that
      // is what keeps onGround true while we stand still.
      body.y = solid.y + solid.height;
      body.onGround = true;
    } else {
      body.y = solid.y - body.height - SKIN; // banged our head on the underside
    }
    body.vy = 0;
  }

  // Look the way we are moving.
  if (body.vx > 0) body.facing = 1;
  if (body.vx < 0) body.facing = -1;
}
