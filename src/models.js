// ---------------------------------------------------------------------------
// Loading 3D models.
//
// Every .glb file sitting next to index.html can be used by its name, so
// Crab.glb is called 'Crab'. Export a Rock.glb out of Blender into that folder
// and you can immediately use 'Rock'. (If a brand new file is not noticed,
// stop the dev server and start it again.)
//
// Loading a file off the disk takes a moment, so this hands the model back
// through a function that gets called once it is ready. Nothing outside this
// file has to worry about that -- see spawn() in main.js.
// ---------------------------------------------------------------------------

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Vite finds every .glb in the folder above this one, at the moment the game is
// built, and gives us the web address of each.
const files = import.meta.glob('../*.glb', { query: '?url', import: 'default', eager: true });

const urls = {};
for (const path in files) {
  const name = path.split('/').pop().replace(/\.glb$/i, '');
  urls[name] = files[path];
}

export const modelNames = Object.keys(urls);

const loader = new GLTFLoader();
const alreadyLoaded = new Map(); // name -> the file, once it has arrived
const waitingFor = new Map(); // name -> everyone who asked for it while it loaded

export function loadModel(name, onReady) {
  const url = urls[name];

  if (!url) {
    console.warn(`There is no model called "${name}". Try one of: ${modelNames.join(', ')}`);
    return;
  }

  // Already have it: hand over a copy straight away.
  if (alreadyLoaded.has(name)) {
    onReady(copyOf(alreadyLoaded.get(name)));
    return;
  }

  // Someone else asked for this a moment ago and it is still loading. Get in line
  // rather than fetching the same file twice.
  if (waitingFor.has(name)) {
    waitingFor.get(name).push(onReady);
    return;
  }

  waitingFor.set(name, [onReady]);

  loader.load(url, (gltf) => {
    alreadyLoaded.set(name, gltf);
    for (const callback of waitingFor.get(name)) callback(copyOf(gltf));
    waitingFor.delete(name);
  });
}

// Each thing in the game needs its own copy of the model, so that two crabs can
// stand in different places doing different things.
//
// We use three.js's SkeletonUtils clone instead of the ordinary one, because a
// plain copy of a bendy model keeps pointing at the original's skeleton -- so
// every copy would move in lockstep, which is a baffling bug to run into.
function copyOf(gltf) {
  return { model: clone(gltf.scene), animations: gltf.animations };
}
