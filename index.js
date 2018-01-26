/* jshint browser: true */

!(function (window, document) {
  var defaults = {
    particalCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    ticks: 200,
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

  function randomPhysics(opts) {
    var radAngle = opts.angle * (Math.PI / 180);
    var radSpread = opts.spread * (Math.PI / 180);

    return {
      x: opts.x,
      y: opts.y,
      wobble: Math.random() * 10,
      velocity: (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity),
      angle2D: -radAngle + ((0.5 * radSpread) - (Math.random() * radSpread)),
      tiltAngle: Math.random() * Math.PI,
      color: hexToRgb(opts.color),
      tick: 0,
      totalTicks: opts.ticks,
      decay: opts.decay
    };
  }

  function updateFetti(context, fetti) {
    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity;
    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + 3; // + gravity
    fetti.wobble += 0.1;
    fetti.velocity *= fetti.decay;
    fetti.tiltAngle += 0.1;

    var progress = (fetti.tick++) / fetti.totalTicks;

    var wobbleX = fetti.x + (10 * Math.cos(fetti.wobble));
    var wobbleY = fetti.y + (10 * Math.sin(fetti.wobble));

    var r = Math.random() + 5;

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

  function animate(context, fettis, width, height, done) {
    var animatingFettis = fettis.slice();

    function update() {
      context.clearRect(0, 0, width, height);

      animatingFettis = animatingFettis.filter(function (fetti) {
        updateFetti(context, fetti);

        return fetti.tick < fetti.totalTicks;
      });

      if (animatingFettis.length) {
        requestAnimationFrame(update);
      } else {
        done();
      }
    }

    requestAnimationFrame(update);

    return {
      addFettis: function (fettis) {
        animatingFettis = animatingFettis.concat(fettis);
      }
    };
  }

  window.confetti = function confetti(options) {
    var particleCount = prop(options, 'particalCount');
    var angle = prop(options, 'angle');
    var spread = prop(options, 'spread');
    var startVelocity = prop(options, 'startVelocity');
    var decay = prop(options, 'decay');
    var colors = prop(options, 'colors');
    var ticks = prop(options, 'ticks');

    var canvas = getCanvas(options ? options.zIndex : null);

    var context = canvas.getContext('2d');

    document.body.appendChild(canvas);

    var temp = particleCount;
    var fettis = [];

    while (temp--) {
      fettis.push(
        randomPhysics({
          x: canvas.width / 2,
          y: canvas.height / 2,
          angle: angle,
          spread: spread,
          startVelocity: startVelocity,
          color: colors[temp % colors.length],
          ticks: ticks,
          decay: decay
        })
      );
    }

    animate(context, fettis, canvas.width, canvas.height, function () {
      document.body.removeChild(canvas);
      console.log('done!');
    });
  };
}(window, document)); // jshint ignore:line
