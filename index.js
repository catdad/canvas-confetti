/* jshint browser: true */

!(function (window, document) {
  var defaults = {
    particalCount: 50
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

  window.confetti = function confetti(options) {
    var particleCount = prop(options, 'particalCount');
    var canvas = getCanvas(options ? options.zIndex : null);

    var context = canvas.getContext('2d');

    context.fillStyle = 'red';
    context.fillRect(canvas.width / 2, canvas.height / 2, 100, 100);

    document.body.appendChild(canvas);
  };
}(window, document));
