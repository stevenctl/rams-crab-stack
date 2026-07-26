// ---------------------------------------------------------------------------
// THE LEVEL KIT.
//
// Short words for building the place the game happens in, so that game.js can
// read like a description of a crab tank rather than a pile of numbers:
//
//   world.tank(60, 18)
//   world.ledge(7, 2)
//   world.rock(-8, 0, 4, 3)
//   world.snack(12)
//
// Every one of these is two or three lines built out of the same two engine
// calls: addSolid() for something to stand on, spawn() for something with a
// model. So if you want a new kind of piece, write one. A cave, a bubble, a
// tower of rocks -- add a function here and it becomes part of the language.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const SAND = 0xe4c68a;
const ROCK = 0x9c8f7a;
const LEDGE = 0x7cb342;
const GLASS = 0x9fd8e8;

export function createLevelTools({ scene, addSolid, removeSolid, spawn }) {
  let tankSolids = []; // the parts of the tank you can bump into
  let tankScenery = []; // the parts that are only there to look at

  function clearTank() {
    for (const solid of tankSolids) removeSolid(solid);
    for (const mesh of tankScenery) scene.remove(mesh);
    tankSolids = [];
    tankScenery = [];
  }

  function makeGlass(solid) {
    solid.mesh.material.transparent = true;
    solid.mesh.material.opacity = 0.3;
    return solid;
  }

  // The tank the whole game happens inside: sand at the bottom, glass at both
  // ends, and a pane across the back to look at.
  //
  // Calling it again rebuilds the tank at a new size, so you can keep trying
  // numbers until it feels right. The middle of the sand is always x = 0, and
  // its top surface is always y = 0 -- which is why the crab starts standing
  // there without being told to.
  function tank(width = 60, height = 18, depth = 20) {
    clearTank();

    const sandDepth = 6; // how thick the sand is. Deep enough not to see under it
    const glassThickness = 1;

    tankSolids.push(addSolid(0, -sandDepth, width, sandDepth, SAND, depth));

    // The two ends. These are solid, so the crab cannot walk out of its tank.
    const edge = width / 2 + glassThickness / 2;
    tankSolids.push(makeGlass(addSolid(-edge, 0, glassThickness, height, GLASS, depth)));
    tankSolids.push(makeGlass(addSolid(edge, 0, glassThickness, height, GLASS, depth)));

    // The back pane. Nothing collides with this -- it is only there so the world
    // does not trail off into empty sky behind the crab.
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(width + glassThickness * 2, height + sandDepth),
      new THREE.MeshStandardMaterial({ color: GLASS, transparent: true, opacity: 0.4 }),
    );
    back.position.set(0, (height - sandDepth) / 2, -depth / 2);
    back.receiveShadow = true;
    scene.add(back);
    tankScenery.push(back);

    return { width, height, depth };
  }

  // A thin shelf to stand on. x is its middle, y is the height of its top.
  function ledge(x, y, width = 5) {
    return addSolid(x, y, width, 0.6, LEDGE, 4);
  }

  // A chunky block. Stack a few to make stairs.
  function rock(x, y = 0, width = 3, height = 2) {
    return addSolid(x, y, width, height, ROCK, 4);
  }

  // An upright slab you cannot get past without jumping.
  function wall(x, y = 0, height = 4) {
    return addSolid(x, y, 0.8, height, ROCK, 4);
  }

  // Something to eat. It is tagged 'snack', so this finds it:
  //   crab.colliding('snack', (snack) => world.remove(snack))
  //
  // Solid and falling, so a pile of them lands in a stack rather than all sitting
  // inside one another.
  function snack(x, y = 0) {
    return spawn('Drumstick', { x, y, size: 1.2, tag: 'snack', solid: true, moves: true });
  }

  // What is left over afterwards. Lying on its side, because it has been dropped,
  // and heavy enough to shove around: walk into it and the crab pushes it along.
  function bone(x, y = 0) {
    return spawn('Bone', { x, y, size: 1.2, tag: 'bone', rotation: 90, pushable: true });
  }

  return { tank, ledge, rock, wall, snack, bone };
}
