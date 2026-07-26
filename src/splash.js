// ---------------------------------------------------------------------------
// The title screen.
//
// Shows a picture until somebody presses a key or clicks, then gets out of the
// way and lets the game begin.
//
// Any image sitting next to index.html can be used by name, the same way models
// and sounds work: ramscrabstack.png is 'ramscrabstack'.
//
// There is a second reason a game wants one of these. Browsers refuse to make
// any sound until the page has been clicked or typed in, so a title screen you
// have to press a key to leave is also what wakes the sound up.
// ---------------------------------------------------------------------------

const files = import.meta.glob('../*.{png,jpg,jpeg,gif,webp}', {
  query: '?url',
  import: 'default',
  eager: true,
});

const images = {};
for (const path in files) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
  images[name] = files[path];
}

export const imageNames = Object.keys(images);

export function showSplash(imageName, message, onStart) {
  const url = images[String(imageName).replace(/\.[^.]+$/, '').toLowerCase()];

  // No picture, no title screen. Better to start the game than to sit behind a
  // blank screen wondering why nothing happens.
  if (!url) {
    console.warn(`There is no image called "${imageName}". Try one of: ${imageNames.join(', ')}`);
    onStart();
    return;
  }

  const splash = document.getElementById('splash');
  const picture = document.createElement('img');
  picture.src = url;
  picture.alt = '';

  const prompt = document.createElement('p');
  prompt.textContent = message;

  splash.append(picture, prompt);

  let started = false;

  function begin() {
    if (started) return; // a key and a click at once should only start one game
    started = true;

    window.removeEventListener('keydown', begin);
    window.removeEventListener('pointerdown', begin);

    splash.classList.add('gone');
    // Take it out of the page once it has faded, so it can never swallow a click.
    setTimeout(() => splash.remove(), 500);

    onStart();
  }

  window.addEventListener('keydown', begin);
  window.addEventListener('pointerdown', begin);
}
