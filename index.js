/* jshint browser: true */

!(function (window, document) {
  var defaults = {
    particalCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    colors: [
      '#26ccff',
      '#a25afd',
      '#ff5e7e',
      '#88ff5a',
      '#fcff42'
    ]
  };

  function prop(options, name) {
    return options ? options[name] || defaults[name] : defaults[name];
  }

  function getCanvas(zIndex) {
    var canvas = document.createElement('canvas');
    var rect = document.body.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.position = 'fixed';
    canvas.style.top = '0px';
    canvas.style.left = '0px';

    if (Number(zIndex)) {
      canvas.style.zIndex = zIndex;
    }

    return canvas;
  }

  function randomPhysics(x, y, angle, spread, startVelocity) {
    var radAngle = angle * (Math.PI / 180);
    var radSpread = spread * (Math.PI / 180);

    return {
      x: x,
      y: y,
      wobble: Math.random() * 10,
      velocity: (startVelocity * 0.5) + (Math.random() * startVelocity),
      angle2D: -radAngle + ((0.5 * radSpread) - (Math.random() * radSpread)),
      tiltAngle: Math.random() * Math.PI
    };
  }

  function updateFetti(context, fetti, progress, decay) {
    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity;
    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity;
    fetti.wobble += 0.1;
    fetti.velocity *= decay;
    fetti.y += 3; // gravity
    fetti.tiltAngle += 0.1;

    var wobbleX = fetti.x + (10 * Math.cos(fetti.wobble));
    var wobbleY = fetti.y + (10 * Math.sin(fetti.wobble));
    var x =       fetti.x + (10 * Math.cos(fetti.tiltAngle));
    var y =       fetti.y + (10 * Math.sin(fetti.tiltAngle));
    var x2 = wobbleX + (10 * Math.cos(fetti.tiltAngle));
    var y2 = wobbleY + (10 * Math.sin(fetti.tiltAngle));

//    context.fillStyle = 'rgba(255, 0, 0, ' + (1 - progress) + ')';
    context.fillStyle = 'red';
    context.beginPath();
    context.moveTo(fetti.x, fetti.y);
    context.lineTo(wobbleX, y);
    context.lineTo(x2, y2);
    context.lineTo(x, wobbleY);
    context.closePath();
    context.fill();
  }

  function animate(context, fettis, decay, width, height, done) {
    var totalTicks = 200;
    var tick = 0;

    function update() {
      context.clearRect(0, 0, width, height);

      fettis.forEach(function (fetti) {
        return updateFetti(context, fetti, tick / totalTicks, decay);
      });

      tick += 1;

      if (tick < totalTicks) {
        requestAnimationFrame(update);
      } else {
        done();
      }
    }

    requestAnimationFrame(update);
  }

  window.confetti = function confetti(options) {
    var particleCount = prop(options, 'particalCount');
    var angle = prop(options, 'angle');
    var spread = prop(options, 'spread');
    var startVelocity = prop(options, 'startVelocity');
    var decay = prop(options, 'decay');

    var canvas = getCanvas(options ? options.zIndex : null);

    var context = canvas.getContext('2d');

    document.body.appendChild(canvas);

    var temp = particleCount;
    var fettis = [];

    while (temp--) {
      fettis.push(
        randomPhysics(canvas.width / 2, canvas.height / 2, angle, spread, startVelocity)
      );
    }

    animate(context, fettis, decay, canvas.width, canvas.height, function () {
      console.log('done!');
    });
  };
}(window, document));
