# Crab Game

A crab is stuck in a tank. Drumsticks keep raining in and piling up in one
corner. Climb the pile, get over the glass, and drop off the outside — you have
escaped, and the next tank is taller.

The world is 3D, but the game code is plain 2D.

## Playing it

- **Arrows** or **A/D** to walk, **space** to jump, **R** to start over.
- On a phone: the **left quarter** of the screen walks left, the **next quarter**
  walks right, and the **whole right half** is a jump button. Two fingers work at
  once, so you can walk and jump together.
- Walk into a drumstick and the crab eats it, leaving a bone you can shove
  around. It won't eat the one it's *standing on* — that one is a step, not a
  snack, or you'd eat your own ladder on the way up. Press **E** to eat that one
  anyway.

## Running it

```sh
bun install   # only needed the first time
bun run dev
```

Then open the link it prints (usually http://localhost:5173). Leave it running —
every time you save a file, the page updates by itself.

## The files

| File             | What it is                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `src/game.js`    | **The game. This is the one to edit.**                                |
| `src/physics.js` | Gravity, and boxes you can't walk through                             |
| `src/input.js`   | Turns key presses into `keys.left`, `pressed.space`, ...              |
| `src/level.js`   | Short words for building the tank and the level. **Extend this.**      |
| `src/models.js`  | Finds and loads the `.glb` files                                      |
| `src/audio.js`   | Finds and plays the sound files                                       |
| `src/splash.js`  | The title screen                                                      |
| `src/main.js`    | The engine: camera, lights, ground, spawning things, the game loop    |
| `index.html`     | The page holding the canvas the game is drawn on                      |
| `Crab.glb`       | The crab model, exported from `Crab.blend`                            |

## How the 2D part works

The crab you control is really just a rectangle — `world.player` — with a
position and a speed. Every frame, `game.js` decides how fast that rectangle
should be moving, the physics moves it and stops it going through anything
solid, and then the 3D crab model is parked wherever the rectangle ended up.

So nothing in `game.js` has to think in 3D:

```js
world.player.x / .y      // where the crab is (x = middle, y = feet)
world.player.vx / .vy    // how fast it is moving, per second
world.player.onGround    // true when standing on something solid
world.keys.left          // true while held
world.keys.r             // every letter a-z works, and world.keys['4'] for digits
world.pressed.space      // true only on the frame the key went down
world.play('Walking')    // play an animation: 'Idle', 'Walking' or 'Eating'
world.hud('Score: 3')    // show text in the corner
world.addPlatform(x, y, width, height)   // x = middle, y = bottom
world.gravity            // -30 by default. Try -10 for the moon
world.time               // seconds since the game started
world.scene, world.camera, world.THREE   // the 3D stuff, if you want it
```

## Putting things in the world

Every `.glb` file next to `index.html` can be spawned by name — `Crab.glb` is
`'Crab'`. Export a new one out of Blender into that folder and it just works.
(`world.models` lists what's available. If a brand new file isn't noticed,
restart the dev server.)

```js
const rock = world.spawn('Rock', { x: 10, y: 0, size: 2, solid: true });
```

| Option           | What it does                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `x`, `y`         | where to put it (x = middle, y = bottom)                         |
| `z`              | how far back into the screen. Handy for scenery                  |
| `size`           | how big the longest side ends up, in world units                 |
| `scale`          | an exact scale factor instead, if you prefer                     |
| `collider`       | how big the collision box is next to the model. `0.6` = smaller  |
| `width`,`height` | an exact collision box instead, in world units                   |
| `solid`          | `true` = nothing can walk through it                             |
| `moves`          | `true` = gravity pulls it down, and `vx`/`vy` move it            |
| `pushable`       | `true` = the crab shoves it along. Includes the other two        |
| `turn`           | how far it turns to face the way it's going. `0` = faces us      |
| `tag`            | what to call it in collision checks. Defaults to the model name  |
| `rotation`       | degrees to tip it over on the screen. `90` lays it on its side   |
| `spin`           | degrees to turn it on the spot, like a record                    |

`rotation` and `spin` are in **degrees**, and can be changed at any time —
`drumstick.rotation = 45`.

Whatever the angle, a thing stays centred on its `x` and rests its lowest point
on its `y`, so a drumstick at `rotation: 90` lies *on* the sand instead of
sinking halfway into it. Its collision box is re-measured to match the new shape
— a drumstick lying down really is wider and shorter than one standing up —
unless you gave it an explicit `width` and `height`, which are always left alone.

Collision boxes themselves never tilt. They're always upright rectangles; that's
what the AABB in `physics.js` means, and it's what keeps that file short enough
to read.

### Gravity, solidity and pushing

These three are separate on purpose, and mean different things:

- **`moves`** — *I* fall, and bump into the world. Gravity applies, and the thing
  lands on the sand and on ledges.
- **`solid`** — *others* bump into me. Without it, the crab walks straight
  through, however heavy the thing looks.
- **`pushable`** — the crab shoves me along when it walks into me.

So pick by what you want:

```js
world.spawn('Bone', { x: 5, moves: true });                 // falls, walk through it
world.spawn('Bone', { x: 5, moves: true, solid: true });    // falls, then blocks you
world.spawn('Bone', { x: 5, pushable: true });              // falls, blocks you, shoves along
world.spawn('Bone', { x: 5, solid: true });                 // hangs in the air, blocks you
```

`pushable` turns on the other two for you — something you could walk through
couldn't be pushed, and something that hung in mid-air once shoved off a ledge
would look broken.

What comes back is the same kind of object as `world.player` — `x`, `y`, `vx`,
`vy`, `onGround`, and its own `.play()` for animations. That's not a
coincidence: the crab **is** a spawned thing, and `game.js` just happens to steer
it with the keyboard.

You can call `.play()` on it immediately, before the model has finished loading —
it remembers and starts the animation the moment it arrives.

`world.remove(thing)` takes one back out. `world.touching(a, b)` says whether two
particular things overlap.

## Building the tank and the level

`src/level.js` holds short words for laying out the place, so `start()` reads
like a description of a crab tank rather than a pile of numbers:

```js
export function start(world) {
  world.tank(60, 18);      // sand at y = 0, glass at both ends
  world.ledge(7, 2);       // a shelf to stand on
  world.ledge(14, 4.5);
  world.rock(-8, 0, 4, 3); // a chunky block
  world.snack(12);         // something to eat
}
```

| Call                     | What it makes                                    |
| ------------------------ | ------------------------------------------------ |
| `world.tank(w, h, d)`    | the tank. Call again to reshape it                |
| `world.ledge(x, y, w)`   | a thin shelf                                      |
| `world.rock(x, y, w, h)` | a chunky block. Stack a few for stairs            |
| `world.wall(x, y, h)`    | an upright slab you have to jump over             |
| `world.snack(x)`         | a drumstick, tagged `'snack'`                     |
| `world.bone(x)`          | a bone lying on its side, tagged `'bone'`         |

The tank's sand always has its top at `y = 0` and its middle at `x = 0` — which
is why the crab starts standing on it without being told to. The glass ends are
solid, so the crab can't leave. A tank is built for you before `start()` runs, so
there's always a floor; calling `world.tank()` yourself just rebuilds it at your
size.

**These are the part you're meant to extend.** Each one is two or three lines
in `level.js` built out of `addSolid` and `spawn`. Want a cave, a bubble, a
tower? Write `world.tower()` next to them and it becomes part of the language
the level is described in.

## Starting a level over

```js
world.reset();
```

Empties the world and runs `start()` again. Safe to call from anywhere — from
`update()`, or from inside a `colliding()` callback — because it happens once the
current frame has finished rather than pulling the list of things apart while
something is still reading it.

It does **not** reload `game.js`, which is the useful part: anything you keep at
the top of that file survives, so `start()` can build a different level each
time.

```js
let level = 1;

export function start(world) {
  world.tank(20 + level * 10, 18);
  for (let i = 0; i < level * 3; i++) world.snack(i * 4 - 8);
}

export function update(world, dt) {
  if (world.player.collidingOne('door')) {
    level += 1;
    world.reset();
  }
}
```

What reset does: removes everything spawned, removes the tank and all the
ledges and rocks, puts the crab back at 0 standing still, clears the HUD, snaps
the camera, builds a default tank so there's always a floor, then calls
`start()`.

The crab keeps its identity — `world.player` is the same object afterwards, so
anything holding a reference to it still works. Its own properties (`crab.eating`
and friends) are left alone, so clear those in `start()` if they matter.

⚠️ Timers you set with `setTimeout` survive a reset and will fire into the new
level. If a drumstick schedules "spawn a bone in 750ms" and the level resets
first, a bone appears in the new level.

## Bumping into things

Every thing answers to a **tag** — the model's name (`'Crab'`, `'Drumstick'`)
unless you give it one:

```js
world.spawn('Drumstick', { x: 5, tag: 'chicken' });
```

Then anything can ask what it's touching right now:

```js
// runs once for EVERY chicken being touched this frame
crab.colliding('chicken', (chicken) => world.remove(chicken));

// stops at the first one, and hands it back as well
const chicken = crab.collidingOne('chicken');
if (chicken) world.hud('yum');
```

Tags aren't fussy about capital letters, so `'crab'` finds a `'Crab'`. Leave the
tag out altogether to hear about anything at all. Nothing ever collides with
itself, and it's safe to `world.remove()` something from inside the function.

**Contact counts as touching.** These checks are deliberately a shade more
generous than the physics, because the physics leaves two things that have bumped
into each other a hair apart on purpose. Without that, walking into something
solid would push the crab clear of it and it would never register — the crab
would nudge a drumstick around the tank forever without managing a bite.

## The title screen

The game opens on `ramscrabstack.png` and waits for a key or a click. Any image
next to `index.html` can be used — change the two lines at the top of
`src/main.js`:

```js
const SPLASH_IMAGE = 'ramscrabstack';
const SPLASH_MESSAGE = 'PRESS ANY KEY TO START';
```

If the image can't be found the game just starts, rather than sitting behind a
blank screen. The world is built while the title is up, so play begins the
instant a key is pressed — but nothing moves or falls until then.

There's a second reason to keep it: browsers refuse to make any sound until the
page has been clicked or typed in, so the title screen is also what wakes the
sound up. Without it, the first chomp would be silent.

## Keys

Every letter is there, plus digits and a few friendly names:

```js
world.keys.r          // held down right now
world.pressed.r       // went down this very frame -- use this for one-off actions
world.keys['4']       // digits need brackets: keys.4 is not valid JavaScript
```

The named ones are `up`, `down`, `left`, `right`, `space`, `shift`, `enter` and
`escape`. Arrows and WASD both feed `up`/`down`/`left`/`right`, and W is *also*
`keys.w`, so you can use it either way.

`pressed` is the one you want for something that should happen once per press —
starting the level again, firing, opening a door. `keys` repeats every frame for
as long as the key is held.

Two things it deliberately stays out of the way of: **ctrl and cmd shortcuts are
left to the browser**, so ctrl+R still reloads the page, and only the arrows and
space stop the page scrolling. Letters never swallow anything.

## Making the collision box smaller than the model

By default a thing's collision box is measured off its model. `collider` scales
that box without touching what you see:

```js
world.spawn('Drumstick', { x: 4, size: 1.2, collider: 0.6 });
```

`0.6` gives a box six tenths the size of the model, tucked inside the shape.
Games do this constantly — a slightly small hitbox is what makes near misses feel
like misses rather than cheap hits.

The box keeps its middle and its base where the model's are, so a shrunken box
pulls the sides and the top inwards while the feet stay on the ground. It's still
measured from the model, so it keeps adapting when the thing is rotated.

`width` and `height` are the alternative: exact numbers in world units. Those are
taken literally and `collider` is *not* applied on top of them. You can give one
and let the other be measured.

## Stacking things up

For things to pile on top of one another they need to be `solid` (so they notice
each other) and `moves` (so they fall):

```js
world.spawn('Drumstick', { x: 4, y: 10, size: 1.2, solid: true, moves: true });
```

Drop three at the same `x` and they land in a stack. `world.snack()` already does
this, and the crab can climb a pile.

Note that `z` is decoration only — the physics is genuinely 2D, so two things at
the same `x` collide no matter how far apart they look in depth. That's what
makes them stack up rather than pass through each other.

The two functions in `game.js`:

- `start(world)` runs once, when the crab has loaded. Build the level here.
- `update(world, dt)` runs every frame. `dt` is how many seconds passed since the
  last one — multiply movement by it and everything stays smooth.

## Sound

Sound files next to `index.html` work exactly like models — `chomp.m4a` is
`'chomp'`. `.m4a`, `.mp3`, `.wav` and `.ogg` all work, and `world.sounds` lists
what's there.

```js
world.playAudio('chomp');
world.playAudio('chomp', { volume: 0.5 });
world.playAudio('waves', { loop: true });
```

The file name works too (`'chomp.m4a'`), and capital letters don't matter — a
game shouldn't fall silent over a typo.

Each call plays its own copy, so eating two drumsticks quickly gives you two
chomps overlapping rather than the second cutting the first short. What comes
back is the sound itself, so you can stop it again:

```js
const waves = world.playAudio('waves', { loop: true });
waves.pause();
```

⚠️ **Browsers refuse to make any noise until the page has been clicked or typed
in.** That's a rule of the browser, not something this code can switch off — so
the very first sound may be silent until a key is pressed. After that it works
normally. Nothing is logged when it happens, so it won't clutter the console.

## First things to try

1. Change `SPEED` and `JUMP` at the top of `game.js`, and save.
2. Set `world.gravity = -8` in `start` and jump on the moon.
3. Move the platforms around, or add more, in `start`.
4. Sprint: `if (world.keys.shift) crab.vx *= 2`
5. Double jump: count the jumps used since the crab last touched the ground, and
   allow a second one in mid-air.
6. Collect the drumsticks. Keep the score above the two functions, so both can
   see it:

   ```js
   let score = 0;
   ```

   scatter some in `start`:

   ```js
   for (let i = 0; i < 8; i++) {
     world.spawn('Drumstick', { x: i * 4 - 10, y: 0, size: 1.2, tag: 'snack' });
   }
   ```

   and eat them in `update`:

   ```js
   world.player.colliding('snack', (snack) => {
     world.remove(snack);
     score += 1;
     world.hud('Snacks: ' + score);
   });
   ```

7. Make the drumstick fall out of the sky: give it `moves: true` when spawning
   it, and it gets gravity like the crab does.

## Building it to share

```sh
bun run build
```

Puts a finished copy in `dist/` that can be uploaded anywhere.

## Sharing it on the web

GitHub can host the game for free and give you a link anyone can play. You push
the code up once, and from then on every push rebuilds the site by itself.

You need `git` installed for this. Type `git --version` in a terminal; if that
isn't recognised, install it from [git-scm.com](https://git-scm.com/downloads)
and open a new terminal afterwards.

**1. Make the repository.** Go to [github.com/new](https://github.com/new) and
create an empty repository. Don't tick any of the boxes that add a README or a
`.gitignore` — this folder already has those. Name it whatever you like; the
name becomes part of the address, so `crabs` gives you `.../crabs/`.

**2. Push the folder up.** In a terminal in this folder, run these one at a
time, putting your own username and repository name in the third line:

```sh
git init
git add .
git commit -m "Crab game"
git remote add origin https://github.com/YOURNAME/crabs.git
git branch -M main
git push -u origin main
```

**3. Turn Pages on.** On your repository page, go to **Settings**, then
**Pages** in the sidebar, and under **Source** choose **GitHub Actions**. This
is the step that is easy to miss, and nothing appears until it's done.

That's it. Go to the **Actions** tab and you'll see the build running. It takes
a minute or two. When it finishes, the address is printed on the workflow run,
and also shown on the Settings → Pages screen. It looks like:

```
https://YOURNAME.github.io/crabs/
```

After that, every `git push` to `main` puts your changes online automatically.
You can also start a build by hand from the Actions tab, using the "Run
workflow" button.

### The two files that make this work

- `.github/workflows/deploy.yml` — the instructions GitHub follows: install
  bun, run `bun run build`, publish `dist/`.
- `vite.config.js` — works out that the game is living in a folder called
  `/crabs/` rather than at the top of the site, so it asks for the crab and the
  sounds in the right place. It reads the name from GitHub while building, so
  there's nothing to edit, even if you rename the repository.

If the page loads dark and empty, that's almost always this folder-name
problem, and it's what `vite.config.js` is there to prevent.
