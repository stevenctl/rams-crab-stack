// ---------------------------------------------------------------------------
// Sound.
//
// Every sound file sitting next to index.html can be played by its name, the
// same way models work. chomp.m4a is 'chomp'. Drop splash.mp3 in the folder and
// it is 'splash'.
//
//   world.playAudio('chomp')
//   world.playAudio('chomp.m4a')     the file name works too
//   world.playAudio('chomp', { volume: 0.5 })
//
// .m4a, .mp3, .wav and .ogg all work.
// ---------------------------------------------------------------------------

const files = import.meta.glob('../*.{m4a,mp3,wav,ogg}', {
  query: '?url',
  import: 'default',
  eager: true,
});

// Keep them under their plain lower-case name, so 'Chomp', 'chomp' and
// 'chomp.m4a' all find the same sound. Nobody wants a game that stays silent
// because of a capital letter.
const sounds = {};
for (const path in files) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();

  // Loaded once, up front, so the browser has the sound ready before the moment
  // it is needed rather than fetching it as the crab bites.
  const sound = new Audio(files[path]);
  sound.preload = 'auto';
  sounds[name] = sound;
}

export const soundNames = Object.keys(sounds);

export function playAudio(name, options = {}) {
  const found = sounds[String(name).replace(/\.[^.]+$/, '').toLowerCase()];

  if (!found) {
    console.warn(`There is no sound called "${name}". Try one of: ${soundNames.join(', ')}`);
    return null;
  }

  // A fresh copy each time, so eating two drumsticks quickly plays two chomps
  // over the top of each other instead of the second cutting the first short.
  const playing = found.cloneNode();
  playing.volume = options.volume ?? 1;
  playing.loop = options.loop ?? false;

  // Browsers refuse to make noise until the page has been clicked or typed in.
  // Until then this quietly does nothing, rather than filling the console with
  // complaints. The first press of an arrow key is enough to wake it up.
  playing.play().catch(() => {});

  return playing;
}
