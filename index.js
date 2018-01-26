/* jshint browser: true */

!(function (window, document) {
  var frame = (function(){
    return window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function (cb) {
        window.setTimeout(cb, 1000 / 60);
      };
  }());

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

  var animationObj;

  function convert(val, transform) {
    return transform ? transform(val) : val;
  }

  function prop(options, name, transform) {
    return convert(
      options ? options[name] || defaults[name] : defaults[name],
      transform
    );
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
      colorHex: opts.color,
      color: hexToRgb(opts.color),
      tick: 0,
      totalTicks: opts.ticks,
      decay: opts.decay,
      random: Math.random() + 5,
      tiltSin: 0,
      tiltCos: 0
    };
  }

  function updateFetti(context, fetti) {
    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity;
    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + 3; // + gravity
    fetti.wobble += 0.1;
    fetti.velocity *= fetti.decay;
    fetti.tiltAngle += 0.1;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    fetti.random = Math.random() + 5;

    var progress = (fetti.tick++) / fetti.totalTicks;

    var wobbleX = fetti.x + (10 * Math.cos(fetti.wobble));
    var wobbleY = fetti.y + (10 * Math.sin(fetti.wobble));

    var x =       fetti.x + (fetti.random * fetti.tiltCos);
    var y =       fetti.y + (fetti.random * fetti.tiltSin);
    var x2 =      wobbleX + (fetti.random * fetti.tiltCos);
    var y2 =      wobbleY + (fetti.random * fetti.tiltSin);

    context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';
    context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
    context.lineTo(Math.floor(wobbleX), Math.floor(y));
    context.lineTo(Math.floor(x2), Math.floor(y2));
    context.lineTo(Math.floor(x), Math.floor(wobbleY));


    return fetti.tick < fetti.totalTicks;
  }

  function batchColors(fettis) {
    var map = fettis.reduce(function (memo, fetti) {
      if (!memo[fetti.colorHex]) {
        memo[fetti.colorHex] = [];
      }

      memo[fetti.colorHex].push(fetti);

      return memo;
    }, {});

    return Object.keys(map).map(function (key) {
      return map[key];
    });
  }

  function animate(canvas, fettis, done) {
    var batches = batchColors(fettis.slice());
    var context = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;

    function filterFetti(fetti) {
      return updateFetti(context, fetti);
    }

    // it's much cheaper to paint multiple particles all at once,
    // but since we have different colors, we need to batch them
    function animateBatch(fettis) {
      context.beginPath();
      var remaining = fettis.filter(filterFetti);
      context.closePath();
      context.fill();

      return remaining;
    }

    function update() {
      context.clearRect(0, 0, width, height);

      var remainingFetti = 0;

//      console.log(batches.length);

      batches = batches.map(function (batch) {
        if (!batch.length) {
          return batch;
        }

        remainingFetti += 1;

        return animateBatch(batch);
      });

      if (remainingFetti) {
        frame(update);
      } else {
        done();
      }
    }

    frame(update);

    return {
      addFettis: function (fettis) {
        batches = batches.concat(batchColors(fettis));
      },
      canvas: canvas
    };
  }

  function confetti(options) {
    var particleCount = prop(options, 'particleCount', Math.floor);
    var angle = prop(options, 'angle', Number);
    var spread = prop(options, 'spread', Number);
    var startVelocity = prop(options, 'startVelocity', Number);
    var decay = prop(options, 'decay', Number);
    var colors = prop(options, 'colors');
    var ticks = prop(options, 'ticks', Number);

    var temp = particleCount;
    var fettis = [];
    var canvas = animationObj ? animationObj.canvas : getCanvas(options ? options.zIndex : null);

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

    // if we have a previous canvas already animating,
    // add to it
    if (animationObj) {
      animationObj.addFettis(fettis);

      return;
    }

    document.body.appendChild(canvas);

    animationObj = animate(canvas, fettis, function () {
      animationObj = null;
      document.body.removeChild(canvas);

      console.log('done!');
    });
  }

  window.confetti = confetti;
}(window, document)); // jshint ignore:line
