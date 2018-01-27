# canvas-confetti

## Demo

[catdad.github.io/canvas-confetti](https://catdad.github.io/canvas-confetti/)

## API

This library is exposed as a `confetti` function on `window`. It takes a single optional `options` object, which has the following properties:

- `particleCount` Integer (default: 50): The number of confetti to launch. More is always fun... but be cool, there's a lot of math involved.
- `angle` Number (default: 90): The angle in which to launch the confetti, in degrees. 90 is straight up.
- `spread` Number (default: 45): How far off center the confetti can go, in degrees. 45 means the confetti will launch at the defined `angle` plus or minus 22.5 degrees.
- `startVelocity` Number (default: 45): How fast the confetti will start going, in pixels.
- `decay` Number (default: 0.9): How quickly the confetti will lose speed. Keep this number between 0 and 1, otherwise the confetti will gain speed. Better yet, just never change it.
- `ticks` Number (default: 200): How many times the confetti will move. This is abstract... but play with it if the confetti disappear too quickly for you.
- `origin` Object: Where to start firing confetti from. Feel free to launch off-screen if you'd like.
  - `origin.x` Number (default: 0.5): The `x` position on the page, with `0` being the left edge and `1` being the right edge.
  - `origin.y` Number (default: 0.5): The `y` position on the page, with `0` being the top edge and `1` being the bottom edge.
- `colors` Array&lt;String&gt;: An array of color strings, in the HEX format... you know, like `#bada55`.
