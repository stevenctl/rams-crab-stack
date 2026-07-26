// ---------------------------------------------------------------------------
// Build settings.
//
// The only job this file has is working out the "base" — the bit of the web
// address the game is served from.
//
// On your own machine, and on most hosts, the game sits at the root of the
// site, so the base is just "/". GitHub Pages is the awkward one: a project
// gets its own folder, so the game lives at
//
//     https://yourname.github.io/crabs/
//
// and every file it asks for has to be asked for as "/crabs/....". Get this
// wrong and the page loads but nothing appears, because the crab, the sounds
// and the code are all being looked for one folder too high up.
//
// Rather than writing the repository name in here — which would then be wrong
// the moment the folder is renamed or someone else forks it — we read it from
// GITHUB_REPOSITORY, which GitHub sets for us while the site is being built.
// It looks like "yourname/crabs", so the half after the slash is the folder.
// ---------------------------------------------------------------------------

import { defineConfig } from 'vite';

function base(command) {
  // The dev server always serves from the root.
  if (command === 'serve') return '/';

  // "yourname/crabs" while GitHub is building. Empty anywhere else.
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) return '/';

  const [owner, name] = repository.split('/');
  if (!name) return '/';

  // A repository named "yourname.github.io" is the one exception: that kind of
  // site is served from the root, with no folder of its own.
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/';

  return `/${name}/`;
}

export default defineConfig(({ command }) => ({
  base: base(command),
}));
