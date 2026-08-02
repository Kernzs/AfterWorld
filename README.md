# AfterWorld

An incremental game about rebuilding a dead planet. Every prestige forks a new
timeline — and the old one never stops producing.

This is the **vertical slice**: eras 1–3, the first fracture, and the multiverse
layer that proves the central idea works. Roughly two hours of play.

```bash
npm install
npm run dev      # play it
npm test         # engine + pacing tests
npm run build    # typecheck + production build
```

## The idea

You start with a cold core and one button. Energy becomes matter, matter becomes
alloy, alloy becomes machines that build faster than you can. Push a world far
enough and its timeline fractures: you begin again on a fresh planet, but the old
one keeps running forever as a frozen timeline, bleeding **chronons** into every
world that comes after it.

You never actually start over. You accumulate worlds.

## The goal

**The Convergence**: one fractured timeline of each of the four paths —
Industrial, Organic, Synthetic, Mystic — each deepened to level 14. Bring them
into phase and the arc ends with the reveal the whole game has been pointing at.

It asks for **breadth, not depth**, and that is the point. Deepening one
timeline costs ×2.4 per level while returning ×1.6, so a player who only digs
into their first world decelerates forever. And because answering the
assemblers with "Delete it" closes both Synthetic and Mystic, the four paths
cannot be collected without giving a different answer across runs. The
orientation stops being flavour and becomes the map.

Converging confiscates nothing. Every world keeps producing and the game stays
playable.

## Architecture

### Two fidelities of simulation

The load-bearing decision. Simulating N whole worlds in parallel does not scale
and buys the player nothing.

- **The active world** is fully simulated: nine buildings, production chains,
  starvation, upgrades, events, eras.
- **A frozen timeline** (`LegacyWorld`) is never simulated again. At the moment
  of fracture its output is condensed once into a production profile, so ticking
  it costs one multiply instead of walking nine buildings.

This is what lets the multiverse hold dozens of worlds, and it makes the fracture
a real decision — *what production profile am I freezing forever?* — which is
what gives the orientation choice (Industrial / Organic / Synthetic / Mystic) any
weight at all.

### Converters can never take more than 80% of throughput

`MAX_THROUGHPUT_SHARE` in `src/engine/world.ts` is a rule, not a tuning knob, and
it exists because the game deadlocks without it.

Assemblers consume matter. Drills are *bought* with matter. Once assembler demand
exceeded matter production, the stockpile could never grow again, so the player
could never afford the drills that would break the shortage — and buildings
cannot be sold, so there was no way out from inside the game. The balance run
sat frozen for 75 minutes before brute-forcing its way clear.

Capping demand at a share of production guarantees the remaining 20% always
accumulates, which makes every bottleneck escapable by construction rather than
by numbers that will drift the next time content is added.

This relies on `BUILDING_TICK_ORDER` listing every producer of a resource before
any of its consumers. A test holds that invariant in place.

### Layout

```
src/
  engine/     pure TypeScript, no React — the simulation
  content/    pure data — buildings, upgrades, eras, orientations, events
  render/     procedural Canvas 2D planet
  components/ React UI
  game/       the bridge between the engine and React
```

**The engine never imports React.** The simulation runs at a fixed 20 Hz on an
accumulator, the UI is told to re-render at ~10 Hz via a version counter, and the
planet canvas reads engine state directly on its own animation frame — so a
60 fps planet never drags the interface into 60 re-renders a second.

Long gaps (a closed tab, a sleeping laptop, a backgrounded tab receiving no
animation frames) are fast-forwarded in coarse steps rather than ground out at
20 Hz. `lastSeenAt` means "the moment the simulation has been advanced to", and
only the tick loop may move it — saving deliberately does not, or every hour
spent with the tab open in the background would be silently erased.

### Numbers

Native `number`, which is comfortable for the ~1e40 ceiling this slice reaches.
All arithmetic is confined to `engine/formulas.ts` and `engine/world.ts`, and all
display goes through `lib/format.ts`, so if later layers push past 1e308 the swap
to a big-number type is contained to three files.

### The planet

An equirectangular surface strip is built from 3D value noise sampled on an
actual sphere (three dimensions because the strip has to wrap seamlessly), then
wrapped onto a disc with a spherical shading pass over the top. It is not a real
projection — the limb darkening is doing the work — but it costs two `drawImage`
calls a frame instead of a per-pixel warp.

Everything expensive is cached in offscreen canvases keyed on *bucketed* visual
state: **22–34 ms to build, 0.1–0.3 ms once warm.** Continuous values are
quantised before they reach a cache key, or every frame would mint a new key and
the cache would be a memory leak that also never hits.

Every visual detail derives from the world's seed and nothing else. That is not a
nicety: you revisit frozen timelines across sessions, so a world must look
exactly the same forever.

## Dev panel

`src/components/DevPanel.tsx` — grant resources, skip time, jump era, force
fracture-readiness, replay an event, simulate coming back after an absence.

It is already excluded from production: `App.tsx` renders it behind
`import.meta.env.DEV`, so Vite drops the module when bundling. **To remove it
entirely**: delete the file and the two lines mentioning `DevPanel` in
`src/App.tsx`. Nothing else references it.

## Pacing

`src/engine/__tests__/balance.test.ts` plays the game with a simulated player and
asserts the result, so pacing is a number the suite defends rather than a guess.
It walks the whole arc — four timelines with the orientations the Convergence
requires, then the deepening — and currently reports:

```
Convergence in 4.98 h · runs 98m → 65m → 51m → 42m · deepening 43.5m
```

Each timeline is faster than the one before it, and the test asserts that.
A human, who does not buy the marginally-best building ten times a second,
should land somewhat above these numbers.

That player scores purchases by *measuring* them — buying the candidate in a
throwaway copy of the world and ticking it. Scoring by a fixed exchange rate does
not work: a smelter turns ~132 energy-equivalent of input into 110 of alloy, so
any price-list heuristic calls the whole refining chain a mistake and stalls in
era 2 forever.

## Not in this slice

Eras 4+ (Ecosystems, Civilisations, Alternate Realities), the Universe /
Multiverse / Dimension layers, links between worlds for trading resources and
technology, audio, PWA install.

The architecture takes them without a rewrite: an era is data in `content/` plus
a layer in `render/`, and the layer above reuses the same `LegacyWorld` pattern
one scale up.
