# canvas-confetti

## Demo

[catdad.github.io/canvas-confetti](https://catdad.github.io/canvas-confetti/)

## API

This library is exposed as a `confetti` function on `window`. It takes a single optional `options` object, which has the following properties:

- `particleCount` Integer (default: 50):
- `angle` Number (default: 90):
- `spread` Number (default: 45):
- `startVelocity` Number (default: 45):
- `decay` Number (default: 0.9):
- `ticks` Number (default: 200):
- `origin` Object:
  - `origin.x` Number (default: 0.5):
  - `origin.y` Number (default: 0.5);
- `colors` Array&lt;String&gt;:
