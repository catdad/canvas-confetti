# canvas-confetti

[![travis][travis.svg]][travis.link]
[![npm-downloads][npm-downloads.svg]][npm.link]
[![npm-version][npm-version.svg]][npm.link]

[travis.svg]: https://travis-ci.org/catdad/canvas-confetti.svg?branch=master
[travis.link]: https://travis-ci.org/catdad/canvas-confetti
[npm-downloads.svg]: https://img.shields.io/npm/dm/canvas-confetti.svg
[npm.link]: https://www.npmjs.com/package/canvas-confetti
[npm-version.svg]: https://img.shields.io/npm/v/canvas-confetti.svg

## Demo

[catdad.github.io/canvas-confetti](https://catdad.github.io/canvas-confetti/)

## Install

You can install this module as a component from NPM:

```bash
npm install --save canvas-confetti
```

You can then `require('canvas-confetti');` to use it in your project build. _Note: this is a client component, and will not run in Node. You will need to build your project with something like [webpack](https://github.com/webpack/webpack) in order to use this._

You can also include this library in your HTML page directly from a CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@0.0.1/dist/confetti.browser.min.js"></script>
```

_Note: you should use the latest version at the time that you include your project. You can see all versions [on the releases page](https://github.com/catdad/canvas-confetti/releases)._

## API

This library is exposed as a `confetti` function on `window`. It takes a single optional `options` object, which has the following properties:

- `particleCount` _Integer (default: 50)_: The number of confetti to launch. More is always fun... but be cool, there's a lot of math involved.
- `angle` _Number (default: 90)_: The angle in which to launch the confetti, in degrees. 90 is straight up.
- `spread` _Number (default: 45)_: How far off center the confetti can go, in degrees. 45 means the confetti will launch at the defined `angle` plus or minus 22.5 degrees.
- `startVelocity` _Number (default: 45)_: How fast the confetti will start going, in pixels.
- `decay` _Number (default: 0.9)_: How quickly the confetti will lose speed. Keep this number between 0 and 1, otherwise the confetti will gain speed. Better yet, just never change it.
- `ticks` _Number (default: 200)_: How many times the confetti will move. This is abstract... but play with it if the confetti disappear too quickly for you.
- `origin` _Object_: Where to start firing confetti from. Feel free to launch off-screen if you'd like.
  - `origin.x` _Number (default: 0.5)_: The `x` position on the page, with `0` being the left edge and `1` being the right edge.
  - `origin.y` _Number (default: 0.5)_: The `y` position on the page, with `0` being the top edge and `1` being the bottom edge.
- `colors` _Array&lt;String&gt;_: An array of color strings, in the HEX format... you know, like `#bada55`.
- `zIndex` _Integer (default: 100)_: The confetti should be on top, after all. But if you have a crazy high page, you can set it even higher.

## Examples

Launch some confetti the default way:

```javascript
confetti();
```

Launch a bunch of confetti:

```javascript
confetti({
  particleCount: 150
});
```

Launch some confetti really wide:

```javascript
confetti({
  spread: 180
});
```

Get creative. Launch a small poof of confetti from a random part of the page:

```javascript
confetti({
  particleCount: 100,
  startVelocity: 30,
  spread: 360,
  origin: {
    x: Math.random(),
    // since they fall down, start a bit higher than random
    y: Math.random() - 0.2
  }
});
```

I said creative... we can do better. Since it doesn't matter how many times we call `confetti` (just the total number of confetti in the air), we can do some fun things, like continuously launch more and more confetti for 30 seconds, from multiple directions:

```javascript
// do this for 30 seconds
var duration = 30 * 1000;
var end = Date.now() + duration;

(function frame() {
  // launch a few confetti from the left edge
  confetti({
    particleCount: 7,
    angle: 60,
    spread: 55,
    origin: { x: 0 }
  });
  // and launch a few from the right edge
  confetti({
    particleCount: 7,
    angle: 120,
    spread: 55,
    origin: { x: 1 }
  });

  // keep going until we are out of time
  if (Date.now() < end) {
    requestAnimationFrame(frame);
  }
}());
```
