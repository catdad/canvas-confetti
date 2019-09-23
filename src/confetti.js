(function () {
  var frame, cancel;
  (function(){
    if (window.requestAnimationFrame && window.cancelAnimationFrame) {
      frame = window.requestAnimationFrame;
      cancel = window.cancelAnimationFrame;
    } else {
      ['webkit', 'moz', 'o', 'ms'].forEach(function (name) {
        if (frame && cancel) {
          return;
        }

        var framename = name + 'RequestAnimationFrame';
        var cancelname = name + 'CancelAnimationFrame';

        if (window[framename] && window[cancelname]) {
          frame = window[framename];
          cancel = window[cancelname];
        }
      });
    }

    if (!(frame && cancel)) {
      frame = function (cb) {
        return window.setTimeout(cb, 1000 / 60);
      };
      cancel = function (timer) {
        return window.clearTimeout(timer);
      };
    }
  }());

  var defaults = {
    particleCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    ticks: 200,
    x: 0.5,
    y: 0.5,
    shapes: ['square', 'circle'],
    zIndex: 100,
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

  function noop() {}

  // create a promise if it exists, otherwise, just
  // call the function directly
  function promise(func) {
    if (module.exports.Promise) {
      return new module.exports.Promise(func);
    }

    func(noop, noop);

    return null;
  }

  function convert(val, transform) {
    return transform ? transform(val) : val;
  }

  function isOk(val) {
    return !(val === null || val === undefined);
  }

  function prop(options, name, transform) {
    return convert(
      options && isOk(options[name]) ? options[name] : defaults[name],
      transform
    );
  }

  function randomInt(min, max) {
    // [min, max)
    return Math.floor(Math.random() * (max - min)) + min;
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

  function getOrigin(options) {
    var origin = prop(options, 'origin', Object);
    origin.x = prop(origin, 'x', Number);
    origin.y = prop(origin, 'y', Number);

    return origin;
  }

  function setCanvasWindowSize(canvas) {
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight;
  }

  function setCanvasRectSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function getCanvas(zIndex) {
    var canvas = document.createElement('canvas');

    setCanvasWindowSize(canvas);

    canvas.style.position = 'fixed';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = zIndex;

    return canvas;
  }

  function ellipse(context, x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(radiusX, radiusY);
    context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
    context.restore();
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
      shape: opts.shape,
      tick: 0,
      totalTicks: opts.ticks,
      decay: opts.decay,
      random: Math.random() + 5,
      tiltSin: 0,
      tiltCos: 0,
      wobbleX: 0,
      wobbleY: 0
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
    fetti.wobbleX = fetti.x + (10 * Math.cos(fetti.wobble));
    fetti.wobbleY = fetti.y + (10 * Math.sin(fetti.wobble));

    var progress = (fetti.tick++) / fetti.totalTicks;

    var x1 = fetti.x + (fetti.random * fetti.tiltCos);
    var y1 = fetti.y + (fetti.random * fetti.tiltSin);
    var x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
    var y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);

    context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';
    context.beginPath();

    if (fetti.shape === 'circle') {
      context.ellipse ?
        context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * 0.6, Math.abs(y2 - y1) * 0.6, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI) :
        ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * 0.6, Math.abs(y2 - y1) * 0.6, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
    } else {
      context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
      context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
      context.lineTo(Math.floor(x2), Math.floor(y2));
      context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
    }

    context.closePath();
    context.fill();

    return fetti.tick < fetti.totalTicks;
  }

  function animate(canvas, fettis, isLibCanvas, allowResize, done) {
    var animatingFettis = fettis.slice();
    var context = canvas.getContext('2d');
    var width = canvas.width;
    var height = canvas.height;
    var resizer = isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
    var animationFrame;
    var destroy;

    function onResize() {
      // don't actually query the size here, since this
      // can execute frequently and rapidly
      width = height = null;
    }

    var prom = promise(function (resolve) {
      function onDone() {
        animationFrame = destroy = null;

        if (allowResize) {
          window.removeEventListener('resize', onResize);
        }

        context.clearRect(0, 0, width, height);

        done();
        resolve();
      }

      function update() {
        if (!width && !height) {
          resizer(canvas);
          width = canvas.width;
          height = canvas.height;
        }

        context.clearRect(0, 0, width, height);

        animatingFettis = animatingFettis.filter(function (fetti) {
          return updateFetti(context, fetti);
        });

        if (animatingFettis.length) {
          animationFrame = frame(update);
        } else {
          onDone();
        }
      }

      animationFrame = frame(update);
      destroy = onDone;
    });

    if (allowResize) {
      window.addEventListener('resize', onResize, false);
    }

    return {
      addFettis: function (fettis) {
        animatingFettis = animatingFettis.concat(fettis);

        return prom;
      },
      canvas: canvas,
      promise: prom,
      reset: function () {
        if (animationFrame) {
          cancel(animationFrame);
        }

        if (destroy) {
          destroy();
        }
      }
    };
  }

  function confettiCannon(canvas, globalOpts) {
    var isLibCanvas = !canvas;
    var allowResize = !!prop(globalOpts || {}, 'resize');
    var resized = false;
    var animationObj;

    function fire(options) {
      var particleCount = prop(options, 'particleCount', Math.floor);
      var angle = prop(options, 'angle', Number);
      var spread = prop(options, 'spread', Number);
      var startVelocity = prop(options, 'startVelocity', Number);
      var decay = prop(options, 'decay', Number);
      var colors = prop(options, 'colors');
      var ticks = prop(options, 'ticks', Number);
      var zIndex = prop(options, 'zIndex', Number);
      var shapes = prop(options, 'shapes');
      var origin = getOrigin(options);

      var temp = particleCount;
      var fettis = [];

      if (isLibCanvas) {
        canvas = animationObj ? animationObj.canvas : getCanvas(zIndex);
      } else if (allowResize && !resized) {
        // initialize the size of a user-supplied canvas
        setCanvasRectSize(canvas);
        resized = true;
      }

      var startX = canvas.width * origin.x;
      var startY = canvas.height * origin.y;

      while (temp--) {
        fettis.push(
          randomPhysics({
            x: startX,
            y: startY,
            angle: angle,
            spread: spread,
            startVelocity: startVelocity,
            color: colors[temp % colors.length],
            shape: shapes[randomInt(0, shapes.length)],
            ticks: ticks,
            decay: decay
          })
        );
      }

      // if we have a previous canvas already animating,
      // add to it
      if (animationObj) {
        return animationObj.addFettis(fettis);
      }

      if (isLibCanvas) {
        document.body.appendChild(canvas);
      }

      animationObj = animate(canvas, fettis, isLibCanvas, (isLibCanvas || allowResize), function () {
        animationObj = null;

        if (isLibCanvas) {
          document.body.removeChild(canvas);
        }
      });

      return animationObj.promise;
    }

    fire.reset = function () {
      if (animationObj) {
        animationObj.reset();
      }
    };

    return fire;
  }

  module.exports = confettiCannon();
  module.exports.create = confettiCannon;
  module.exports.Promise = window.Promise || null;
}());
