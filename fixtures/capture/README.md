# Capture probe pages

Small synthetic pages, one technique each, for checking what `capture.mjs` can and cannot measure.
They hold no real content. `?v=b` (and a few other queries) switches a page to a variant that changes
one value, so a comparison shows whether that value is measured at all.

| Page | What it probes | Queries |
|---|---|---|
| `css.html` | CSS loops, entrances, transitions, hover, `::after`, scroll-driven `view()`, SVG | `v=b` |
| `js.html` | WAAPI, a timer that re-creates an animation, a count-up, a rAF loop, IntersectionObserver reveals | `v=b` |
| `loader.html` | a loader removed on load, one removed by a timer, one held open by a toggle | `v=b`, `t=<ms>` |
| `gsap.html` | GSAP tweens, ScrollTrigger parallax, scrub, pin | `v=b` |
| `scroll.html` | a reveal under `scroll-behavior: smooth` and under Lenis | `smooth=1`, `lenis=1` |
| `canvas.html` | 2D canvas, three.js, video | `v=b` |
| `sheets.html` | library CSS with and without `crossorigin`, `light-dark()` | `co=1`, `local=1` |
| `extra.html` | GSAP hover, a mobile-only animation, a closed menu | `v=b` |

## The noise check

```
node fixtures/capture/noise.mjs js.html "scroll.html?smooth=1" css.html
```

It captures each page twice and compares the captures. A row means the page changes on its own, which
no build could ever match. `js.html` has rows on purpose (its count-up and rAF loop); the others should
be at or near 0. `/artifact-parity:design` runs the same check on every design before publishing.

## What the v0.10.0 research found

Measured and compared: CSS `@keyframes` (loops frozen at frame 0, entrances finished), transitions,
`element.animate()`, animated `::before`/`::after`, CSS hover on the element, dark mode through
`@media (prefers-color-scheme: dark)` at the widest size.

Not measured, so the build copies them but the score can't see them:

- GSAP and `requestAnimationFrame` motion (no Animation objects; only the frame at measure time).
- Anything that depends on the scroll position: the page is measured at the top, after one scroll pass.
- Hover changes on `::before`/`::after`, hover that starts an infinite animation, JS hover tweens.
- `prefers-reduced-motion` rules (never emulated), `animation-range`, `object-fit`, SVG SMIL, canvas and
  video pixels, animations defined only inside a narrow media query.
- Rules in a stylesheet loaded without `crossorigin`, and `light-dark()` colors.

A loader removed on load is never measured; one held open (a toggle, or the `#hold-loader` hash in a design) is.
