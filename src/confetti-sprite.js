(function main(global, module) {

  function randomPhysics() {
    return {
      wobble: Math.random() * 10,
      wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
      tiltAngle: (Math.random() * (0.6 - 0.4) + 0.4) * Math.PI,
      random: Math.random() + 2,
      tiltSin: 0,
      tiltCos: 0,
      wobbleX: 0,
      wobbleY: 0,
      x: 50,
      y: 50
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
    fetti.random = Math.random() + 2;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    fetti.wobbleX = Math.cos(fetti.wobble);
    fetti.wobbleY = Math.sin(fetti.wobble);

    var x1 = fetti.x * fetti.tiltCos + fetti.tiltSin;
    var y1 = fetti.y * fetti.tiltSin + fetti.tiltCos;
    var x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
    var y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);

    text(ctx, fetti.x, fetti.y, Math.abs(x2 - x1) * 0.2, Math.abs(y2 - y1) * 0.2, Math.PI / 10 * fetti.wobble, char);

    if (count === 0) {
      return;
    }

    requestAnimationFrame(function () {
      ctx.clearRect(0, 0, 100, 100);
      draw(count - 1, ctx, char, fetti);
    });
  }

  function sprite(opts) {
    var char = opts.char;

    var temp = getCanvas(100, 100);
    var tempCtx = temp.getContext('2d');
    var final = getCanvas(100 * frames, 100);
    var finalCtx = final.getContext('2d');

    var fetti = randomPhysics();
    console.log(fetti);
    var frames = Math.ceil(180);

    console.log('using %s frames', frames);

    document.body.appendChild(temp);

    draw(frames, tempCtx, char, fetti);
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
