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
      '#fcff42',
      '#ffa62d',
      '#ff36ff'
    ]
  };

  function prop(options, name) {
    return options ? options[name] || defaults[name] : defaults[name];
  }

  function toDecimal(str) {
    return parseInt(str, 16);
  }

  function hexToRgb(str) {
    var val = String(str).replace(/[^0-9a-f]/gi, '');

    if (val.length < 6) {
        val = val[0]+val[0]+val[1]+val[1]+val[2]+val[2];
    }

    return {
      r: toDecimal(val.substring(0,2)),
      g: toDecimal(val.substring(2,4)),
      b: toDecimal(val.substring(4,6))
    };
  }

  function getCanvas(zIndex) {
    var canvas = document.createElement('canvas');
    var rect = document.body.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.position = 'fixed';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.pointerEvents = 'none';

    if (Number(zIndex)) {
      canvas.style.zIndex = zIndex;
    }

    return canvas;
  }

  function randomPhysics(x, y, angle, spread, startVelocity, color) {
    var radAngle = angle * (Math.PI / 180);
    var radSpread = spread * (Math.PI / 180);

    return {
      x: x,
      y: y,
      wobble: Math.random() * 10,
      velocity: (startVelocity * 0.5) + (Math.random() * startVelocity),
      angle2D: -radAngle + ((0.5 * radSpread) - (Math.random() * radSpread)),
      tiltAngle: Math.random() * Math.PI,
      color: hexToRgb(color)
    };
  }

  function updateFetti(context, fetti, progress, decay) {
    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity;
    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + 3; // + gravity
    fetti.wobble += 0.1;
    fetti.velocity *= decay;
    fetti.tiltAngle += 0.1;

    var wobbleX = fetti.x + (10 * Math.cos(fetti.wobble));
    var wobbleY = fetti.y + (10 * Math.sin(fetti.wobble));

    var r = Math.random() * 5;

    var x =       fetti.x + (r * Math.cos(fetti.tiltAngle));
    var y =       fetti.y + (r * Math.sin(fetti.tiltAngle));
    var x2 =      wobbleX + (r * Math.cos(fetti.tiltAngle));
    var y2 =      wobbleY + (r * Math.sin(fetti.tiltAngle));

    context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';
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
    var colors = prop(options, 'colors');

    var canvas = getCanvas(options ? options.zIndex : null);

    var context = canvas.getContext('2d');

    document.body.appendChild(canvas);

    var temp = particleCount;
    var fettis = [];

    while (temp--) {
      fettis.push(
        randomPhysics(canvas.width / 2, canvas.height / 2, angle, spread, startVelocity, colors[temp % colors.length])
      );
    }

    animate(context, fettis, decay, canvas.width, canvas.height, function () {
      document.body.removeChild(canvas);
      console.log('done!');
    });
  };
}(window, document)); // jshint ignore:line
