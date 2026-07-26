// ---------------------------------------------------------------------------
// The engine.
//
// This sets up the window, the camera, the lights and the ground, and knows how
// to put a thing with a 3D model into the world. It then runs the game loop:
// ask the game what it wants to do, run the physics, draw the picture.
//
// You normally do NOT need to change anything in here.
// The game itself lives in game.js -- that is the file to edit.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

import { keys, pressed, endFrame } from './input.js';
import { createBody, step, touching } from './physics.js';
import { loadModel, modelNames } from './models.js';
import { playAudio, soundNames } from './audio.js';
import { showSplash } from './splash.js';
import { createLevelTools } from './level.js';
import * as game from './game.js';

// How many world units fit on the screen from top to bottom. Smaller = zoomed in.
const VIEW_HEIGHT = 14;

// The title screen. The name is an image file sitting next to index.html.
const SPLASH_IMAGE = 'ramscrabstack';
const SPLASH_MESSAGE = 'PRESS ANY KEY TO START';

// Rotations are given in degrees, because degrees are easier to picture. This
// turns them into what three.js actually wants.
const DEGREES = Math.PI / 180;

// --- Renderer: the thing that actually draws pixels into the <canvas> --------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- Scene: the world. Everything visible gets added to this ----------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue

// --- Camera -------------------------------------------------------------------
//
// An orthographic camera has no perspective: things do not get smaller as they
// get further away. That is what makes the game look flat, like a 2D game, even
// though everything in it is really 3D.
//
// Tilting it down slightly lets us see the tops of the platforms and a little of
// the ground behind the crab, which gives a feeling of depth without bending the
// picture the way a normal camera would.

const CAMERA_TILT = Math.PI / 48; // about 4 degrees. Bigger = more of a bird's eye view
const CAMERA_LOOK_HEIGHT = 3; // how far above the crab's feet the camera aims

// How far back the camera sits. With an orthographic camera this does not change
// the size of anything on screen -- it only keeps the world in front of the lens.
const CAMERA_DISTANCE = 60;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

// The spot the camera is aiming at. It slides after the crab instead of snapping
// to it, which looks much nicer.
const cameraTarget = new THREE.Vector3(0, CAMERA_LOOK_HEIGHT, 0);

function placeCamera() {
  camera.position.set(
    cameraTarget.x,
    cameraTarget.y + Math.sin(CAMERA_TILT) * CAMERA_DISTANCE,
    cameraTarget.z + Math.cos(CAMERA_TILT) * CAMERA_DISTANCE,
  );
  camera.lookAt(cameraTarget);
}

placeCamera();

// --- Lights ------------------------------------------------------------------

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0xd9b382, 1.4));

// The sun, off to one side and in front, so the crab is lit and casts a shadow.
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(6, 14, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);
scene.add(sun.target); // the sun follows the crab, so the shadows never run out

// --- Solid things -------------------------------------------------------------
//
// `solids` is the list of rectangles nothing can walk through. The physics in
// physics.js only ever looks at this list -- it never sees the 3D shapes.

const solids = [];

// `depth` is how far the shape reaches back into the screen. The physics ignores
// it completely -- it only exists so the tilted camera has something to look at.
function addSolid(x, y, width, height, color, depth = 4) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.set(x, y + height / 2, 0); // y is the bottom of the box, not the middle
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  const solid = { x, y, width, height, mesh };
  solids.push(solid);
  return solid;
}

function removeSolid(solid) {
  const index = solids.indexOf(solid);
  if (index !== -1) solids.splice(index, 1);
  if (solid.mesh) scene.remove(solid.mesh);
}

// --- Things --------------------------------------------------------------------
//
// A "thing" is anything in the game with a 3D model: the crab, a rock, a fish.
// It is really just a rectangle with a model drawn on top -- exactly the same
// kind of rectangle the physics uses, so everything in the game works the same
// way and there is only one idea to learn.

const things = [];

function spawn(modelName, options = {}) {
  const thing = createBody(
    options.x ?? 0,
    options.y ?? 0,
    options.width ?? 1,
    options.height ?? 1,
  );

  thing.z = options.z ?? 0; // how far back into the screen it sits
  thing.rotation = options.rotation ?? 0; // degrees, tipping over on the screen
  thing.spin = options.spin ?? 0; // degrees, turning on the spot like a record
  thing.turn = options.turn ?? 0; // 0 = always faces the camera
  // Something pushable has to be solid (or you would walk straight through it)
  // and has to fall (or it would hang in the air once shoved off a ledge), so
  // asking for pushable quietly asks for both.
  thing.pushable = options.pushable ?? false;
  thing.moves = options.moves ?? thing.pushable; // does gravity apply to it?
  thing.tag = options.tag ?? modelName; // what to call it when looking for collisions
  thing.model = null; // the 3D model, once it has finished loading
  thing.mixer = null; // the thing that plays its animations

  // Where the model has to sit relative to its rectangle so that it looks right
  // however it has been turned. Worked out in reseat(), below.
  thing.offsetX = 0;
  thing.offsetY = 0;
  thing.offsetZ = 0;

  // How big the collision box is next to the model it is drawn around. 1 means
  // the same size; 0.6 means a box only six tenths as big, tucked inside the
  // shape. Smaller boxes feel fairer to play against, because near misses stay
  // misses.
  thing.collider = options.collider ?? 1;

  // Only measure the collision box off the model if the game did not ask for a
  // particular size. An exact width or height given by the game is exact, and
  // `collider` is not applied on top of it.
  thing.autoWidth = options.width === undefined;
  thing.autoHeight = options.height === undefined;

  let actions = {};
  let currentAction = null;
  let askedFor = null; // an animation asked for before the model arrived

  // Before the model has loaded there is nothing to animate, so remember what was
  // asked for and start it the moment it arrives. That way the game can say
  // thing.play('Idle') on the very first line and it simply works.
  thing.play = (name) => {
    askedFor = name;
  };

  function play(name, fadeSeconds = 0.2) {
    const next = actions[name];
    if (!next) {
      console.warn(`"${modelName}" has no animation called "${name}". `
        + `Try: ${Object.keys(actions).join(', ') || '(it has none)'}`);
      return;
    }
    if (next === currentAction) return; // already playing it

    next.reset().fadeIn(fadeSeconds).play();
    if (currentAction) currentAction.fadeOut(fadeSeconds);
    currentAction = next;
  }

  // Bumping into other things.
  //
  //   crab.colliding('chicken', (chicken) => { ... })
  //
  // The function is run once for every chicken the crab is overlapping right
  // now, so if it is standing on three of them it runs three times. Leave the
  // tag out to be told about everything it is touching.
  thing.colliding = (tag, whatToDo) => {
    const hits = findOverlapping(thing, tag);
    if (typeof tag === 'function') whatToDo = tag;

    // We look first and act afterwards, so that the function is still safe to
    // call world.remove() from without upsetting the list halfway through.
    if (whatToDo) for (const other of hits) whatToDo(other);
    return hits;
  };

  // The same, but it stops at the first one it finds. This is usually what you
  // want, and it also hands the thing back, so both of these work:
  //
  //   crab.collidingOne('chicken', (chicken) => world.remove(chicken))
  //   if (crab.collidingOne('chicken')) world.hud('found one!')
  thing.collidingOne = (tag, whatToDo) => {
    const hit = findOverlapping(thing, tag, true)[0] ?? null;
    if (typeof tag === 'function') whatToDo = tag;

    if (hit && whatToDo) whatToDo(hit);
    return hit;
  };

  if (options.solid || thing.pushable) solids.push(thing);
  things.push(thing);

  loadModel(modelName, ({ model, animations }) => {
    fitModel(model, options);
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    // The model sits inside a group, because the model has been nudged around to
    // get its feet on the floor and we want to move the group without disturbing
    // that.
    const group = new THREE.Group();
    group.add(model);
    scene.add(group);
    thing.model = group;

    reseat(thing); // work out where it sits, and how big its box should be

    if (animations.length > 0) {
      thing.mixer = new THREE.AnimationMixer(model);
      for (const clip of animations) actions[clip.name] = thing.mixer.clipAction(clip);
    }

    thing.play = play;
    if (askedFor) play(askedFor, 0);
  });

  return thing;
}

// Turning a thing spins its model around its own feet, which would leave a
// drumstick lying at 90 degrees with half of it buried in the sand. So whenever
// the way it is turned changes, we measure the model again and work out where to
// put it: middle over its rectangle, lowest point resting on the ground.
//
// The collision box is measured again too, unless the game asked for a size of
// its own -- a drumstick lying down really is wider and shorter than one
// standing up. The box never tilts, though. It is always an upright rectangle:
// that is what the AABB in physics.js means, and what keeps that file short.
function reseat(thing) {
  const group = thing.model;

  group.rotation.z = thing.rotation * DEGREES;
  group.rotation.y = thing.turn * thing.facing + thing.spin * DEGREES;

  // Measure it sitting at the origin, so what comes back is the model's own
  // shape rather than wherever it happens to be standing.
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);

  thing.offsetX = -(box.min.x + box.max.x) / 2;
  thing.offsetY = -box.min.y;
  thing.offsetZ = -(box.min.z + box.max.z) / 2;

  // The box keeps its middle and its base where the model's are, so shrinking it
  // pulls the sides and the top inwards while the feet stay on the ground.
  if (thing.autoWidth) thing.width = (box.max.x - box.min.x) * thing.collider;
  if (thing.autoHeight) thing.height = (box.max.y - box.min.y) * thing.collider;

  // Remember what this was worked out for, so we only do it again when something
  // actually turns.
  thing.seatedRotation = thing.rotation;
  thing.seatedSpin = thing.spin;
  thing.seatedTurn = thing.turn;
  thing.seatedFacing = thing.facing;
  thing.seatedCollider = thing.collider;
}

function needsReseating(thing) {
  return (
    thing.rotation !== thing.seatedRotation ||
    thing.spin !== thing.seatedSpin ||
    thing.turn !== thing.seatedTurn ||
    thing.facing !== thing.seatedFacing ||
    thing.collider !== thing.seatedCollider
  );
}

// Everything of a given kind that `self` is overlapping right now. Tags are
// matched without worrying about capital letters, so 'crab' finds a 'Crab'.
// Leaving the tag out means "anything at all".
function findOverlapping(self, tag, stopAtFirst = false) {
  const wanted = typeof tag === 'string' ? tag.toLowerCase() : null;
  const found = [];

  for (const other of things) {
    if (other === self) continue; // nothing collides with itself
    if (wanted !== null && String(other.tag).toLowerCase() !== wanted) continue;
    if (!touching(self, other)) continue;

    found.push(other);
    if (stopAtFirst) break;
  }

  return found;
}

// Models come out of Blender at whatever size they were built at -- the crab is
// nearly 10 units wide. `size` says how big the longest side should end up, which
// is easier to think about than a scale factor. Then we shift the model so its
// feet are at the bottom and its middle is at the front, matching where the
// physics rectangle's position is measured from.
function fitModel(model, options) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);

  model.scale.setScalar(options.size ? options.size / longestSide : (options.scale ?? 1));

  const fitted = new THREE.Box3().setFromObject(model);
  const middle = fitted.getCenter(new THREE.Vector3());
  model.position.set(-middle.x, -fitted.min.y, -middle.z);
}

function remove(thing) {
  const inThings = things.indexOf(thing);
  if (inThings !== -1) things.splice(inThings, 1);

  const inSolids = solids.indexOf(thing);
  if (inSolids !== -1) solids.splice(inSolids, 1);

  if (thing.model) scene.remove(thing.model);
}

// --- The crab we control --------------------------------------------------------
//
// The player is just a spawned thing like any other. The only difference is that
// game.js steers this one and the camera follows it.
//
// `turn: 0` keeps the crab facing the camera the whole time, scuttling sideways,
// which is what real crabs do. Math.PI / 2 makes it turn to face the way it walks.

const player = spawn('Crab', {
  size: 2,
  width: 1.4, // the collision box is a bit smaller than the model --
  height: 1.2, // that always feels fairer to play
  moves: true,
  turn: 0,
});

// --- The world object we hand to the game ------------------------------------

const hudElement = document.getElementById('hud');

const world = {
  // tank(), ledge(), rock(), wall(), snack(), bone() -- the level kit, in level.js
  ...createLevelTools({ scene, addSolid, removeSolid, spawn }),

  THREE,
  scene,
  camera,
  keys,
  pressed,
  player, // the crab the game controls
  things, // everything with a model in it, including the player
  models: modelNames, // the names you are allowed to spawn
  sounds: soundNames, // the names you are allowed to play

  // Make a noise: world.playAudio('chomp'), or with { volume: 0.5, loop: true }.
  // Hands back the sound, so you can playing.pause() it again if you want.
  playAudio,
  time: 0, // seconds since the game started
  gravity: -30, // how hard things are pulled downwards

  // Put something with a 3D model into the world. The name is a .glb file sitting
  // next to index.html, so 'Crab' means Crab.glb.
  //
  //   world.spawn('Crab', { x: 7, y: 0, size: 1.5 })
  //
  // Options, all optional:
  //   x, y      where to put it (x = middle, y = bottom)
  //   z         how far back into the screen. Handy for scenery
  //   size      how big the longest side should be, in world units
  //   scale     an exact scale factor instead, if you prefer
  //   collider  how big the collision box is next to the model. 0.6 = smaller
  //             than it looks, so near misses stay misses
  //   width     an exact collision box instead, if you want particular numbers
  //   height
  //   solid     true = nothing can walk through it
  //   moves     true = gravity and speed apply to it
  //   pushable  true = the crab shoves it along. Solid and falling, both included
  //   turn      how far it turns to face the way it is going. 0 = faces us
  //   tag       what to call it in collision checks. Defaults to the model name
  //   rotation  degrees to tip it over on the screen. 90 lays it on its side
  //   spin      degrees to turn it on the spot, like a record
  //
  // rotation and spin can also be changed later: drumstick.rotation = 45
  spawn,

  // Take something back out of the world again.
  remove,

  // Start the level over: empties the world and runs start() again. Safe to call
  // from anywhere, including inside a colliding() callback -- it happens once the
  // current frame has finished. game.js is not reloaded, so anything you are
  // keeping at the top of that file (which level, the score, lives left) carries
  // over, and start() can build a different level depending on it.
  reset,

  // Are these two things in contact? Use it to pick up coins, bump into fish...
  touching,

  // Add a plain coloured platform to stand on. x is its middle, y is its bottom.
  addPlatform(x, y, width, height, color = 0x8bc34a) {
    return addSolid(x, y, width, height, color);
  },

  // Play one of the crab's animations: 'Idle', 'Walking' or 'Eating'.
  play(name, fadeSeconds) {
    player.play(name, fadeSeconds);
  },

  // Write text in the corner of the screen: world.hud('Score: 3')
  hud(text) {
    hudElement.textContent = text;
  },
};

// --- Starting a level over again -------------------------------------------
//
// world.reset() empties the world and runs start() again. It does NOT reload
// game.js, so anything you are keeping track of at the top of that file -- which
// level you are on, a score, how many lives are left -- survives, and start() can
// build a different level depending on it.

let resetWanted = false;

function reset() {
  // Not right now. The game might be halfway through looking at the list of
  // things when it asks for this -- inside a colliding() callback, say -- and
  // emptying that list underneath it would skip whatever came next. The game
  // loop picks this up once the frame's work is finished.
  resetWanted = true;
}

function startLevel() {
  resetWanted = false;

  // Everything the last level put there goes, except the crab: game.js holds on
  // to world.player, and handing it a different object would leave it steering a
  // crab that is no longer in the game.
  for (const thing of [...things]) {
    if (thing !== player) remove(thing);
  }

  // Then the scenery: the tank, and every ledge and rock.
  for (const solid of [...solids]) removeSolid(solid);

  // Put the crab back at the beginning, standing still.
  player.x = 0;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.facing = 1;
  player.rotation = 0;
  player.spin = 0;

  hudElement.textContent = '';

  // Snap the camera rather than letting it glide over from wherever it was.
  cameraTarget.set(player.x, player.y + CAMERA_LOOK_HEIGHT, 0);
  placeCamera();

  // A tank first, so there is always sand under the crab's feet even if start()
  // does not build one. Calling world.tank() again inside start() just reshapes
  // this one. This is also what clears away the old tank's back pane, which is
  // scenery rather than something solid.
  world.tank();

  game.start(world);
}

startLevel();

// The world is built straight away, so it is ready and waiting behind the title
// screen. Nothing moves until the player presses a key: this is what the game
// loop checks before running the game and the physics.
let playing = false;

// --- Keep the picture matching the window size ---------------------------------

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const halfHeight = VIEW_HEIGHT / 2;
  const halfWidth = halfHeight * (width / height);

  renderer.setSize(width, height, false);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

// --- The game loop -------------------------------------------------------------
//
// This runs about 60 times a second. Each time round we work out how much time
// has passed (dt, in seconds), let the game decide what to do, move everything,
// then draw it.

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1); // cap dt so one slow frame can't teleport things

  // While the title screen is up we still draw the world, and the crab still
  // breathes, but nothing plays and nothing falls.
  if (playing) {
    world.time += dt;
    game.update(world, dt);
  }

  for (const thing of things) {
    if (playing && thing.moves) step(thing, solids, world.gravity, dt);

    // Put the 3D model wherever its rectangle ended up.
    if (thing.model) {
      if (needsReseating(thing)) reseat(thing);

      thing.model.position.set(
        thing.x + thing.offsetX,
        thing.y + thing.offsetY,
        thing.z + thing.offsetZ,
      );
    }

    if (thing.mixer) thing.mixer.update(dt);
  }

  followPlayer(dt);

  // Now that nothing is halfway through reading the list of things, it is safe
  // to throw the level away and build it again.
  if (resetWanted) startLevel();

  renderer.render(scene, camera);
  endFrame();
});

// Move the spot the camera is aiming at a fraction of the way towards the crab,
// then put the camera back above and behind that spot.
function followPlayer(dt) {
  const amount = Math.min(4 * dt, 1);
  cameraTarget.x += (player.x - cameraTarget.x) * amount;
  cameraTarget.y += (player.y + CAMERA_LOOK_HEIGHT - cameraTarget.y) * amount;
  placeCamera();

  // Drag the sun along too, so the crab keeps its shadow wherever it wanders.
  sun.position.set(player.x + 6, player.y + 14, 10);
  sun.target.position.set(player.x, player.y, 0);
}

// --- Off we go ------------------------------------------------------------------

showSplash(SPLASH_IMAGE, SPLASH_MESSAGE, () => {
  playing = true;
  clock.getDelta(); // throw away however long the title screen was up for

  // On a phone, the tap that starts the game lands somewhere on the controls.
  // Forget it, so starting the game does not also fire off a jump.
  endFrame();
});
