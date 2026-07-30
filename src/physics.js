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

// How deep something may already be sunk into a face before we stop believing
// it crossed that face this frame. Head bumps and rounding leave bodies up to a
// SKIN inside things on purpose, and those slivers must still be read as "you
// are on this side" -- not as "you are lost somewhere in the middle".
const SLOP = SKIN * 4;

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

  // Where our sides were as this frame began. Which way we are moving cannot
  // tell us which side we came in from -- see the up-and-down pass below for
  // why -- and "whichever side we are nearer to" is worse: a hair's overlap
  // with the sand, which is as wide as the whole tank, would fling us to
  // whichever end of the tank was closer. Where we started from is the truth.
  const leftWas = body.x - body.width / 2;
  const rightWas = body.x + body.width / 2;
  body.x += body.vx * dt;

  for (const solid of solids) {
    if (solid === body) continue; // a solid thing that moves must not hit itself
    if (!overlaps(body, solid)) continue;

    const solidLeft = solid.x - solid.width / 2;
    const solidRight = solid.x + solid.width / 2;

    // Which face did we actually cross this frame?
    const cameFromTheLeft = rightWas <= solidLeft + SLOP;
    const cameFromTheRight = leftWas >= solidRight - SLOP;

    // Neither means we began the frame already level with it -- it fell into
    // us, or we are wading out of something we were left inside. There is no
    // face to put us back behind, and pushing us to either far side is the
    // teleport we are trying not to do. Walk on through; the overlap mends
    // itself as soon as we are clear.
    if (!cameFromTheLeft && !cameFromTheRight) continue;

    // How far we have sunk into it -- which is how far it would have to shift to
    // be out of our way again, plus a hair so they end up properly apart rather
    // than exactly touching.
    const sunkIn = cameFromTheLeft
      ? body.x + body.width / 2 - solidLeft + SKIN
      : body.x - body.width / 2 - solidRight - SKIN;

    // If it is something that can be shoved along, try shoving it rather than
    // stopping dead. If it goes, we carry on walking as though it were not there.
    if (solid.pushable && push(solid, sunkIn, solids, body)) continue;

    // Stop a hair short rather than exactly touching. Exactly touching has to
    // survive a rounding error to still count as "not overlapping", and when it
    // does not, the up-and-down pass below sees a sliver of overlap and thinks
    // we are standing on the thing we just walked into.
    if (cameFromTheLeft) {
      body.x = solidLeft - body.width / 2 - SKIN; // hit its left side
    } else {
      body.x = solidRight + body.width / 2 + SKIN; // hit its right side
    }
    body.vx = 0;
  }

  // --- Up and down ---
  body.onGround = false;

  // Where our feet and head were as this frame began. Which way we are moving
  // is not enough to say which side of a thing we hit: standing still we are
  // always falling a whisker (that is what keeps onGround true), so the moment
  // something dropped into us from above, "falling" would read as "landed on
  // it" and we would snap up to its top -- and then to the top of the next
  // thing we overlap at that height, riding the whole pile up in one frame.
  // Where we started from says which face we actually crossed.
  const feetWere = body.y;
  const headWas = body.y + body.height;
  body.y += body.vy * dt;

  for (const solid of solids) {
    if (solid === body) continue;
    if (!overlaps(body, solid)) continue;

    if (feetWere >= solid.y + solid.height - SLOP) {
      // Our feet began the frame at or above its top, so we landed on it.
      // Landing sits exactly on the surface, on purpose. Every frame gravity
      // sinks us a whisker into the floor and this lifts us back out, and that
      // is what keeps onGround true while we stand still.
      body.y = solid.y + solid.height;
      body.onGround = true;
      body.vy = 0;
    } else if (headWas <= solid.y + SLOP) {
      body.y = solid.y - body.height - SKIN; // banged our head on the underside
      body.vy = 0;
    }
    // Neither means we were already level with it when the frame began: it is
    // not a floor or a ceiling, it is something that fell into us or that we
    // slid into. Same answer as the sideways pass gives: no guessing, walk on
    // through, and the overlap mends itself as soon as we are clear.
  }

  // Look the way we are moving.
  if (body.vx > 0) body.facing = 1;
  if (body.vx < 0) body.facing = -1;
}
