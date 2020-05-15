(function main(global, module) {
  var Promise = global.Promise;

  function randomPhysics(opts) {
    return {
      wobble: Math.random() * 10,
      wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
      tiltAngle: (Math.random() * (0.6 - 0.4) + 0.4) * Math.PI,
      tiltSin: 0,
      tiltCos: 0,
      wobbleX: 0,
      wobbleY: 0,
      x: opts.size / 2,
      y: opts.size / 2
    };
  }

  function getCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    return canvas;
  }

  function text(context, x, y, scaleX, scaleY, rotation, char) {
    context.setTransform(scaleX, 0, 0, scaleY, x, y);
    context.rotate(rotation);
    context.textAlign = 'center';
    context.font = 'normal normal 6px auto';
    context.fillText(char, 0, 0);
    context.setTransform(1,0,0,1,0,0);
  }

  function draw(count, ctx, char, fetti) {
    fetti.wobble += fetti.wobbleSpeed;
    fetti.tiltAngle += 0.1;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    fetti.wobbleX = Math.cos(fetti.wobble);
    fetti.wobbleY = Math.sin(fetti.wobble);

    var x1 = fetti.x * fetti.tiltCos + fetti.tiltSin;
    var y1 = fetti.y * fetti.tiltSin + fetti.tiltCos;
    var x2 = fetti.wobbleX + fetti.tiltCos;
    var y2 = fetti.wobbleY + fetti.tiltSin;

    text(ctx, fetti.x, fetti.y, Math.abs(x2 - x1) * 0.2, Math.abs(y2 - y1) * 0.2, Math.PI / 10 * fetti.wobble, char);
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.src = url;
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
    });
  }

  function sprite(opts) {
    var char = opts.char;
    var size = opts.size || 100;

    var fetti = randomPhysics({ size: size });
    var frames = Math.ceil(180);

    var temp = getCanvas(size, size);
    var tempCtx = temp.getContext('2d');

    var final = getCanvas(size * frames, size);
    var finalCtx = final.getContext('2d');

    return new Array(frames).fill(1).reduce(function (prom, url, i) {
      return prom.then(function () {
        tempCtx.clearRect(0, 0, size, size);
        draw(0, tempCtx, char, fetti);

        return loadImage(temp.toDataURL());
      }).then(function (img) {
        finalCtx.drawImage(img, 0, 0, size, size, i * size, 0, size, size);
      });
    }, Promise.resolve()).then(function () {
      return final.toDataURL();
    });
  }

  module.exports = module.exports || {};
  module.exports.sprite = sprite;
}((function () {
  if (typeof window !== 'undefined') {
    return window;
  }

  if (typeof self !== 'undefined') {
    return self;
  }

  return this;
})(), module, false));
