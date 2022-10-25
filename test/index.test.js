import fs from 'fs';
import http from 'http';
import path from 'path';
import { promisify } from 'util';

import test from 'ava';
import puppeteer from 'puppeteer';
import send from 'send';
import root from 'rootrequire';
import jimp from 'jimp';

const PORT = 9999;
const width = 500;
const height = 500;

// Docker-based CIs need this disabled
// https://github.com/Quramy/puppeteer-example/blob/c28a5aa52fe3968c2d6cfca362ec28c36963be26/README.md#with-docker-based-ci-services
const args = process.env.CI ? [
  '--no-sandbox', '--disable-setuid-sandbox'
] : [];
const headless = process.env.CI ? true :
  process.env['CONFETTI_SHOW'] ? false : true;

const mkdir = async (dir) => {
  return promisify(fs.mkdir)(dir)
    .then(() => Promise.resolve())
    .catch(err => {
      if (err.code === 'EEXIST') {
        return Promise.resolve();
      }

      return Promise.reject(err);
    });
};

const testServer = (function startServer() {
  let server;

  return function () {
    return new Promise((resolve) => {
      if (server) {
        return resolve(server);
      }

      server = http.createServer(function (req, res) {
        var file = path.resolve(root, req.url.slice(1));
        send(req, file).pipe(res);
      }).listen(PORT, () => {
        resolve(server);
      });
    });
  };
}());

const testBrowser = (() => {
  let browser;

  return function () {
    if (browser) {
      return Promise.resolve(browser);
    }

    return puppeteer.launch({
      headless,
      args: [ '--disable-background-timer-throttling' ].concat(args)
    }).then(thisBrowser => {
      browser = thisBrowser;
      return Promise.resolve(browser);
    });
  };
})();

const testPage = async () => {
  const browser = await testBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width, height });

  // eslint-disable-next-line no-console
  page.on('pageerror', err => console.error(err));

  return page;
};

const fixturePage = async (urlPath = 'fixtures/page.html') => {
  const page = await testPage();
  await page.goto(`http://localhost:${PORT}/${urlPath}`);

  return page;
};

// eslint-disable-next-line no-unused-vars
const sleep = (time) => {
  return new Promise(resolve => {
    setTimeout(() => resolve(), time);
  });
};

const createBuffer = (data, format) => {
  try {
    return Buffer.from(data, format);
  } catch(e) {
    return new Buffer(data, format);
  }
};

function confetti(opts, wait = false, funcName = 'confetti') {
  return `
${wait ? '' : `${funcName}.Promise = null;`}
${funcName}(${opts ? JSON.stringify(opts) : ''});
`;
}

async function confettiImage(page, opts = {}, funcName = 'confetti') {
  const base64png = await page.evaluate(`
  ${funcName}(${JSON.stringify(opts)});
  new Promise(function (resolve, reject) {
    setTimeout(function () {
      var canvas = document.querySelector('canvas');
      return resolve(canvas.toDataURL('image/png'));
    }, 200);
  });
`);

  const imageData = base64png.replace(/data:image\/png;base64,/, '');
  return createBuffer(imageData, 'base64');
}

function hex(n) {
  const pad = (n) => {
    while (n.length < 2) {
      n = '0'+n;
    }
    return n;
  };

  return pad(n.toString(16));
}

const getImageBuffer = async (image) => {
  return await promisify(image.getBuffer.bind(image))(jimp.MIME_PNG);
};

const readImage = async (buffer) => {
  return Buffer.isBuffer(buffer) ? await jimp.read(buffer) : buffer;
};

const uniqueColors = async (buffer) => {
  const image = await readImage(buffer);
  const pixels = new Set();

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
    const r = image.bitmap.data[idx + 0];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];

    pixels.add(`#${hex(r)}${hex(g)}${hex(b)}`);
  });

  return Array.from(pixels).sort();
};

const uniqueColorsBySide = async (buffer) => {
  const image = await readImage(buffer);

  const { width, height } = image.bitmap;
  const leftImage = image.clone().crop(0, 0, width / 2, height);
  const rightImage = image.clone().crop(width / 2, 0, width/2, height);

  return {
    left: await uniqueColors(leftImage),
    right: await uniqueColors(rightImage)
  };
};

const totalPixels = async(buffer) => {
  const image = await readImage(buffer);
  let pixels = 0;
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
    const r = image.bitmap.data[idx + 0];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];

    if (r === 255 && g === 255 && b === 255) { return; }

    pixels++;
  });
  return pixels;
};

const removeOpacity = async (buffer) => {
  const image = await readImage(buffer);
  image.rgba(false).background(0xFFFFFFFF);
  var opaqueBuffer = await promisify(image.getBuffer.bind(image))(jimp.MIME_PNG);

  return await jimp.read(opaqueBuffer);
};

const reduceImg = async (buffer, opaque = true) => {
  const image = opaque ?
    await removeOpacity(buffer) :
    await readImage(buffer);

  // basically dialate the crap out of everything
  image.blur(2);
  image.posterize(1);

  return image;
};

const emptyImg = function (width, height) {
  return new Promise((resolve, reject) => {
    new jimp(width, height, (err, img) => {
      if (err) {
        return reject(err);
      }

      resolve(img);
    });
  });
};

test.before(async () => {
  await mkdir('./shots');
  await testServer();
  await testBrowser();
});

test.after(async () => {
  const browser = await testBrowser();
  await browser.close();

  const server = await testServer();
  await new Promise(resolve => {
    server.close(() => resolve());
  });
});

// hack to get the status of a test, until AVA implements this
// https://github.com/avajs/ava/issues/840
test.beforeEach((t) => {
  t.context.page = null;
  t.context.passing = false;
});
test.afterEach((t) => {
  t.context.passing = true;
});

test.afterEach.always(async t => {
  if (t.context.page) {
    await t.context.page.close();
  }

  if (t.context.passing && !process.env['CONFETTI_SHOW']) {
    return;
  }

  // this is allowed, but still needs the eslint plugin to be updated
  // https://github.com/avajs/eslint-plugin-ava/issues/176
  // eslint-disable-next-line ava/use-t-well
  const name = t.title.replace(/^afterEach\.always hook for /, '');

  // save the raw buffer image, if one is present
  if (t.context.buffer) {
    await promisify(fs.writeFile)(`shots/${name}.original.png`, t.context.buffer);
  }

  // save the simplified/tested image, if one is present
  if (t.context.image) {
    await promisify(t.context.image.write.bind(t.context.image))(`shots/${name}.reduced.png`);
  }
});

/*
 * Image-based tests
 */

test('shoots default confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page);
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.true(pixels.length >= 7);
  t.true(pixels.length <= 8);
});

test('shoots red confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff0000']
  });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff0000', '#ffffff']);
});

test('shoots blue confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff']
  });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#0000ff', '#ffffff']);
});

test('shoots circle confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    shapes: ['circle']
  });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#0000ff', '#ffffff']);
});

test('shoots star confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    shapes: ['star']
  });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#0000ff', '#ffffff']);
});

test('shoots default scaled confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    shapes: ['circle'],
    particleCount: 10
  });
  t.context.image = await removeOpacity(t.context.buffer);

  const pixels = await totalPixels(t.context.image);

  t.is(pixels > 100 && pixels < 500, true);
});

test('shoots larger scaled confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    shapes: ['circle'],
    scalar: 10,
    particleCount: 10
  });
  t.context.image = await removeOpacity(t.context.buffer);

  const pixels = await totalPixels(t.context.image);

  t.is(pixels > 2000, true);
});

test('shoots confetti to the left', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    particleCount: 100,
    angle: 180,
    startVelocity: 20
  });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColorsBySide(t.context.image);

  // left side has stuff on it
  t.deepEqual(pixels.left, ['#0000ff', '#ffffff']);
  // right side is all white
  t.deepEqual(pixels.right, ['#ffffff']);
});

test('shoots confetti to the right', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    particleCount: 100,
    angle: 0,
    startVelocity: 20
  });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColorsBySide(t.context.image);

  // right side has stuff on it
  t.deepEqual(pixels.right, ['#0000ff', '#ffffff']);
  // left side is all white
  t.deepEqual(pixels.left, ['#ffffff']);
});

/*
 * Operational tests
 */

test('shoots confetti repeatedly using requestAnimationFrame', async t => {
  const page = t.context.page = await fixturePage();
  const time = 6 * 1000;

  let opts = {
    colors: ['#0000ff'],
    origin: { y: 1 },
    count: 1
  };

  // continuously animate more and more confetti
  // for 10 seconds... that should be longer than
  // this test... we won't wait for it anyway
  page.evaluate(`
    var opts = ${JSON.stringify(opts)};
    var end = Date.now() + (${time});

    (function frame() {
      confetti(opts);

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  `);

  await sleep(time / 4);
  const buff1 = await page.screenshot({ type: 'png' });
  await sleep(time / 4);
  const buff2 = await page.screenshot({ type: 'png' });
  await sleep(time / 4);
  const buff3 = await page.screenshot({ type: 'png' });
  await sleep(time / 4);
  const buff4 = await page.screenshot({ type: 'png' });

  const img1 = await readImage(buff1);
  const img2 = await readImage(buff2);
  const img3 = await readImage(buff3);
  const img4 = await readImage(buff4);
  const { width, height } = img1.bitmap;

  const comp = await emptyImg(width * 4, height);
  await comp.composite(img1, 0, 0);
  await comp.composite(img2, width, 0);
  await comp.composite(img3, width * 2, 0);
  await comp.composite(img4, width * 3, 0);

  t.context.buffer = await getImageBuffer(comp);
  t.context.image = await reduceImg(t.context.buffer);

  t.deepEqual(await uniqueColors(await reduceImg(img1)), ['#0000ff', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img2)), ['#0000ff', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img3)), ['#0000ff', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img4)), ['#0000ff', '#ffffff']);
});

test('uses promises when available', async t => {
  const page = t.context.page = await fixturePage();

  await page.evaluate(confetti({}, true));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  // make sure that all confetti have disappeared
  t.deepEqual(pixels, ['#ffffff']);
});

test('removes the canvas when done', async t => {
  const page = t.context.page = await fixturePage();

  function hasCanvas() {
    return page.evaluate(`!!document.querySelector('canvas')`);
  }

  // make sure there is no canvas before executing confetti
  t.is(await hasCanvas(), false);

  const promise = page.evaluate(confetti({}, true));

  // confetti is running, make sure a canvas exists
  t.is(await hasCanvas(), true);

  await promise;

  // confetti is done, canvas should be gone now
  t.is(await hasCanvas(), false);
});

test('handles window resizes', async t => {
  const time = 50;

  const page = t.context.page = await fixturePage();
  await page.setViewport({ width: width / 2, height });

  let opts = {
    colors: ['#0000ff'],
    origin: { x: 1, y: 0 },
    angle: 0,
    startVelocity: 0,
    particleCount: 2
  };

  // continuously animate more and more confetti
  // for 10 seconds... that should be longer than
  // this test... we won't wait for it anyway
  page.evaluate(`
    var opts = ${JSON.stringify(opts)};
    var end = Date.now() + (10 * 1000);

    var promise = confetti(opts);

    var interval = setInterval(function() {
        if (Date.now() > end) {
            return clearInterval(interval);
        }

        confetti(opts);
    }, ${time});
  `);

  await sleep(time * 4);
  await page.setViewport({ width, height });
  await sleep(time * 4);

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  // chop this image into thirds
  let widthThird = Math.floor(width / 3);
  let first = t.context.image.clone().crop(widthThird * 0, 0, widthThird, height);
  let second = t.context.image.clone().crop(widthThird * 1, 0, widthThird, height);
  let third = t.context.image.clone().crop(widthThird * 2, 0, widthThird, height);

  // the first will be white, the second and third will have confetti in them
  t.deepEqual(await uniqueColors(first), ['#ffffff']);
  t.deepEqual(await uniqueColors(second), ['#0000ff', '#ffffff']);
  t.deepEqual(await uniqueColors(third), ['#0000ff', '#ffffff']);
});

test('stops and removes canvas immediately when `reset` is called', async t => {
  const page = t.context.page = await fixturePage();

  const promise = page.evaluate(`new Promise((resolve, reject) => {
    const results = [];
    results.push(!!document.querySelector('canvas'));
    confetti().then(() => {
      results.push('done');
    });
    results.push(!!document.querySelector('canvas'));
    confetti.reset();
    results.push(!!document.querySelector('canvas'));
    resolve(results);
  })`);

  const results = await promise;

  t.deepEqual(results, [false, true, false, 'done']);
});

/*
 * Custom canvas
 */

const injectCanvas = async (page, opts = {}, createName = 'confetti.create') => {
  const allowResize = 'allowResize' in opts ? opts.allowResize : true;
  const useWorker = 'useWorker' in opts ? opts.useWorker : false;

  await page.evaluate(`
    var canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    document.body.appendChild(canvas);

    window.myConfetti = ${createName}(canvas, {
      resize: ${!!allowResize},
      useWorker: ${!!useWorker}
    });
  `);
};

const getCanvasSize = async (page) => {
  return await page.evaluate(`
    var canvas = document.querySelector('canvas');
    var size = { width: canvas.width, height: canvas.height };
    Promise.resolve(size);
  `);
};

test('can create instances of confetti in separate canvas', async t => {
  const page = t.context.page = await fixturePage();
  await injectCanvas(page);

  const beforeSize = await getCanvasSize(page);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff0000']
  }, 'myConfetti');
  t.context.image = await reduceImg(t.context.buffer);

  const afterSize = await getCanvasSize(page);

  t.deepEqual(await uniqueColors(t.context.image), ['#ff0000', '#ffffff']);
  t.notDeepEqual(beforeSize, afterSize);
});

test('can use a custom canvas without resizing', async t => {
  const page = t.context.page = await fixturePage();
  await injectCanvas(page, { allowResize: false });

  const beforeSize = await getCanvasSize(page);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff0000'],
    startVelocity: 2,
    spread: 360,
    origin: { y: 0 }
  }, 'myConfetti');
  t.context.image = await reduceImg(t.context.buffer);

  const afterSize = await getCanvasSize(page);

  t.deepEqual(await uniqueColors(t.context.image), ['#ff0000', '#ffffff']);
  t.deepEqual(beforeSize, afterSize);
});

const resizeTest = async (t, createOpts, createName = 'confetti.create') => {
  const time = 50;

  const page = t.context.page = await fixturePage();
  await page.setViewport({ width: width / 2, height });

  let fireOpts = {
    colors: ['#0000ff'],
    origin: { x: 1, y: 0 },
    angle: 0,
    startVelocity: 0,
    particleCount: 2
  };

  // continuously animate more and more confetti
  // for 10 seconds... that should be longer than
  // this test... we won't wait for it anyway
  page.evaluate(`
    var canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    document.body.appendChild(canvas);

    var myConfetti = ${createName}(canvas, ${JSON.stringify(createOpts)});

    var opts = ${JSON.stringify(fireOpts)};
    var end = Date.now() + (10 * 1000);

    var promise = myConfetti(opts);

    var interval = setInterval(function() {
      if (Date.now() > end) {
        return clearInterval(interval);
      }

      myConfetti(opts);
    }, ${time});
  `);

  await sleep(time * 4);
  await page.setViewport({ width, height });
  await sleep(time * 4);

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  // chop this image into thirds
  let widthThird = Math.floor(width / 3);
  let first = t.context.image.clone().crop(widthThird * 0, 0, widthThird, height);
  let second = t.context.image.clone().crop(widthThird * 1, 0, widthThird, height);
  let third = t.context.image.clone().crop(widthThird * 2, 0, widthThird, height);

  // the first will be white, the second and third will have confetti in them
  t.deepEqual(await uniqueColors(first), ['#ffffff']);
  t.deepEqual(await uniqueColors(second), ['#0000ff', '#ffffff']);
  t.deepEqual(await uniqueColors(third), ['#0000ff', '#ffffff']);
};

test('resizes the custom canvas when the window resizes', async t => {
  await resizeTest(t, {
    resize: true
  });
});

test('resizes the custom canvas when the window resizes and a worker is used', async t => {
  await resizeTest(t, {
    resize: true,
    useWorker: true
  });
});

test('can use a custom canvas with workers and resize it', async t => {
  const page = t.context.page = await fixturePage();
  await injectCanvas(page, {
    allowResize: true,
    useWorker: true
  });

  const beforeSize = await getCanvasSize(page);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff0000']
  }, 'myConfetti');
  t.context.image = await reduceImg(t.context.buffer);

  const afterSize = await getCanvasSize(page);

  t.deepEqual(await uniqueColors(t.context.image), ['#ff0000', '#ffffff']);
  t.notDeepEqual(beforeSize, afterSize);
});

test('shoots confetti repeatedly in defaut and custom canvas using requestAnimationFrame', async t => {
  const page = t.context.page = await fixturePage();
  await injectCanvas(page);
  const time = 6 * 1000;

  let regular = {
    colors: ['#0000ff'],
    origin: { x: 0.2, y: 1 },
    count: 1,
    spread: 10
  };
  let custom = {
    colors: ['#ff0000'],
    origin: { x: 0.8, y: 1 },
    count: 1,
    spread: 10
  };

  // continuously animate more and more confetti
  // for 10 seconds... that should be longer than
  // this test... we won't wait for it anyway
  page.evaluate(`
    var regular = ${JSON.stringify(regular)};
    var custom = ${JSON.stringify(custom)};
    var end = Date.now() + (${time});

    (function frame() {
      confetti(regular);
      myConfetti(custom);

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  `);

  await sleep(time / 4);
  const buff1 = await page.screenshot({ type: 'png' });
  await sleep(time / 4);
  const buff2 = await page.screenshot({ type: 'png' });
  await sleep(time / 4);
  const buff3 = await page.screenshot({ type: 'png' });
  await sleep(time / 4);
  const buff4 = await page.screenshot({ type: 'png' });

  const img1 = await readImage(buff1);
  const img2 = await readImage(buff2);
  const img3 = await readImage(buff3);
  const img4 = await readImage(buff4);
  const { width, height } = img1.bitmap;

  const comp = await emptyImg(width * 4, height);
  await comp.composite(img1, 0, 0);
  await comp.composite(img2, width, 0);
  await comp.composite(img3, width * 2, 0);
  await comp.composite(img4, width * 3, 0);

  t.context.buffer = await getImageBuffer(comp);
  t.context.image = await reduceImg(t.context.buffer);

  t.deepEqual(await uniqueColors(await reduceImg(img1)), ['#0000ff', '#ff0000', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img2)), ['#0000ff', '#ff0000', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img3)), ['#0000ff', '#ff0000', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img4)), ['#0000ff', '#ff0000', '#ffffff']);
});

test('can initialize the same canvas multiple times when using a worker', async t => {
  const page = t.context.page = await fixturePage();
  await page.evaluate(`
    var canvas = document.createElement('canvas');
    canvas.id = 'testcanvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    document.body.appendChild(canvas);
  `);

  await page.evaluate(`
    var canvas = document.querySelector('#testcanvas');
    var instance1 = confetti.create(canvas, { resize: true, useWorker: true });
  `);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff0000'],
    startVelocity: 2,
    spread: 360,
  }, 'instance1');
  t.context.image = await reduceImg(t.context.buffer);

  t.deepEqual(await uniqueColors(t.context.image), ['#ff0000', '#ffffff']);

  await page.evaluate(`
    var canvas = document.querySelector('#testcanvas');
    var instance2 = confetti.create(canvas, { resize: true, useWorker: true });
  `);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff00ff'],
    startVelocity: 2,
    spread: 360,
  }, 'instance2');
  t.context.image = await reduceImg(t.context.buffer);

  // note: canvas is owned by the worker, so an existing animation will continue
  t.deepEqual(await uniqueColors(t.context.image), ['#ff0000', '#ff00ff', '#ffffff']);
});

test('can initialize the same canvas multiple times without using a worker', async t => {
  const page = t.context.page = await fixturePage();
  await page.evaluate(`
    var canvas = document.createElement('canvas');
    canvas.id = 'testcanvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    document.body.appendChild(canvas);
  `);

  await page.evaluate(`
    var canvas = document.querySelector('#testcanvas');
    var instance1 = confetti.create(canvas, { resize: true, useWorker: false });
  `);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff0000'],
    startVelocity: 2,
    spread: 360,
  }, 'instance1');
  t.context.image = await reduceImg(t.context.buffer);

  t.deepEqual(await uniqueColors(t.context.image), ['#ff0000', '#ffffff']);

  await page.evaluate(`
    var canvas = document.querySelector('#testcanvas');
    var instance2 = confetti.create(canvas, { resize: true, useWorker: false });
  `);

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff00ff'],
    startVelocity: 2,
    spread: 360,
  }, 'instance2');
  t.context.image = await reduceImg(t.context.buffer);

  // note: canvas can only be owned by one instance in the main thread,
  // so the animation is reset
  t.deepEqual(await uniqueColors(t.context.image), ['#ff00ff', '#ffffff']);
});

test('calling `reset` method clears all existing confetti but more can be launched after', async t => {
  const page = t.context.page = await fixturePage();
  await injectCanvas(page);

  const prom1 = page.evaluate(confetti({ colors: ['#ff0000'] }, true, 'myConfetti'));
  await sleep(50);
  const img1 = await page.screenshot({ type: 'png' });

  await Promise.all([
    prom1,
    page.evaluate(`myConfetti.reset();`)
  ]);
  const img2 = await page.screenshot({ type: 'png' });

  const prom2 = page.evaluate(confetti({ colors: ['#ff0000'] }, true, 'myConfetti'));
  await sleep(50);
  const img3 = await page.screenshot({ type: 'png' });

  await prom2;

  t.deepEqual(await uniqueColors(await reduceImg(img1)), ['#ff0000', '#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img2)), ['#ffffff']);
  t.deepEqual(await uniqueColors(await reduceImg(img3)), ['#ff0000', '#ffffff']);
});

/*
 * Browserify tests
 */

test('works using the browserify bundle', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.browserify.html');

  await page.evaluate(`void confetti({
    colors: ['#00ff00'],
    particleCount: 200,
    spread: 270
  })`);

  await sleep(100);

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#00ff00', '#ffffff']);
});

/*
 * Minified tests
 * using minification close to that of jsDelivr
 */

test('works using the terser minified and compressed code', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.minified.html');

  await page.evaluate(`void confetti({
    colors: ['#ff00ff'],
    particleCount: 200,
    spread: 270
  })`);

  await sleep(100);

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff00ff', '#ffffff']);
});

/*
 * ESM tests
 */

test('the esm module exposed confetti as the default', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff00ff']
  }, 'confettiAlias');

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff00ff', '#ffffff']);
});

test('the esm module exposed confetti.create as create', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  await injectCanvas(page, { allowResize: true }, 'createAlias');

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff00ff']
  }, 'myConfetti');
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff00ff', '#ffffff']);
});

test('exposed confetti method has a `reset` property', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  t.is(await page.evaluate(`typeof confettiAlias.reset`), 'function');
});
