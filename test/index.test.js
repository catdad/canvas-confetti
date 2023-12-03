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

const args = ['--disable-background-timer-throttling'];

// Docker-based CIs need this disabled
// https://github.com/Quramy/puppeteer-example/blob/c28a5aa52fe3968c2d6cfca362ec28c36963be26/README.md#with-docker-based-ci-services
if (process.env.CI) {
  args.push('--no-sandbox', '--disable-setuid-sandbox');
}

const headless = (process.env.CI || !('CONFETTI_SHOW' in process.env)) ? 'new' : false;

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
      args
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
  // eslint-disable-next-line no-console
  page.on('console', msg => console.log(msg.text()));

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

function serializeConfettiOptions(opts) {
  let serializedOpts = opts ? JSON.stringify(opts) : '';

  if (opts && opts.shapes && Array.isArray(opts.shapes)) {
    const { shapes, ...rest } = opts;

    const serializedShapes = shapes.map(shape => {
      if (typeof shape === 'function') {
        return `(${shape.toString()})()`;
      }

      return JSON.stringify(shape);
    });

    serializedOpts = `{
      ...${JSON.stringify(rest)},
      shapes: [${serializedShapes.join(', ')}]
    }`;
  }

  return serializedOpts;
}

function confetti(opts, wait = false, funcName = 'confetti') {
  const serializedOpts = serializeConfettiOptions(opts);

  return `
${wait ? '' : `${funcName}.Promise = null;`}
${funcName}(${serializedOpts});
`;
}

const base64ToBuffer = base64png => createBuffer(base64png.replace(/data:image\/png;base64,/, ''), 'base64');

async function confettiImage(page, opts = {}, funcName = 'confetti') {
  const serializedOpts = serializeConfettiOptions(opts);
  const base64png = await page.evaluate(`
    ${funcName}(${serializedOpts});
    new Promise(function (resolve, reject) {
      setTimeout(function () {
        var canvas = document.querySelector('canvas');
        return resolve(canvas.toDataURL('image/png'));
      }, 200);
    });
  `);

  return base64ToBuffer(base64png);
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
    particleCount: 1,
    startVelocity: 0,
    gravity: 0,
    flat: true
  });
  t.context.image = await removeOpacity(t.context.buffer);

  const pixels = await totalPixels(t.context.image);

  const expected = 124;
  t.true(pixels > expected * .99 && pixels < expected * 1.01, `${pixels}±1% ≠ ${expected}`);
});

test('shoots larger scaled confetti', async t => {
  const page = t.context.page = await fixturePage();

  t.context.buffer = await confettiImage(page, {
    colors: ['#0000ff'],
    shapes: ['circle'],
    scalar: 10,
    particleCount: 1,
    startVelocity: 0,
    gravity: 0,
    flat: true
  });
  t.context.image = await removeOpacity(t.context.buffer);

  const pixels = await totalPixels(t.context.image);

  const expected = 11476;
  t.true(pixels > expected * .99 && pixels < expected * 1.01, `${pixels} ± 1% ≠ ${expected}`);
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

test('shoots flat confetti', async t => {
  const page = t.context.page = await fixturePage();

  // these parameters should create an image
  // that is the same every time
  t.context.buffer = await confettiImage(page, {
    startVelocity: 0,
    gravity: 0,
    scalar: 20,
    flat: 1,
    shapes: ['circle'],
    colors: ['ff0000']
  });
  t.context.image = await readImage(t.context.buffer);

  t.is(t.context.image.hash(), '8E0802208w0');
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
 * Shape from path
 */
test('[paths] `shapeFromPath` creates an object with a path and transform matrix', async t => {
  const page = t.context.page = await fixturePage();

  const result = await page.evaluate(`
    confetti.shapeFromPath('M0 0 L10 0 L10 10 L0 10z');
  `);

  t.deepEqual(result, {
    type: 'path',
    path: 'M0 0 L10 0 L10 10 L0 10z',
    matrix: [ 1, 0, 0, 1, -5, -5 ]
  });
});

test('[paths] `shapeFromPath` crops the shape and centers in the middle of the actual path object', async t => {
  const page = t.context.page = await fixturePage();

  const result = await page.evaluate(`
    confetti.shapeFromPath('M100 100 L110 100 L110 110 L100 110z');
  `);

  t.deepEqual(result, {
    type: 'path',
    path: 'M100 100 L110 100 L110 110 L100 110z',
    matrix: [ 1, 0, 0, 1, -105, -105 ]
  });
});

test('[paths] shoots confetti of a custom shape', async t => {
  const page = t.context.page = await fixturePage();

  const shape = await page.evaluate(`
    confetti.shapeFromPath('M0 10 L5 0 L10 10z');
  `);

  // these parameters should create an image
  // that is the same every time
  t.context.buffer = await confettiImage(page, {
    startVelocity: 0,
    gravity: 0,
    scalar: 20,
    flat: 1,
    shapes: [shape],
    colors: ['ff0000']
  });
  t.context.image = await readImage(t.context.buffer);

  t.is(t.context.image.hash(), '9I0p03d03c0');
});

/*
 * Shape from text
 */

const loadFont = async page => {
  // Noto Color Emoji
  const url = 'https://fonts.gstatic.com/s/notocoloremoji/v25/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.9.woff2';
  const name = 'Web Font';

  await page.evaluate(`
    Promise.resolve().then(async () => {
      const fontFile = new FontFace(
        "${name}",
        "url(${url})",
      );

      document.fonts.add(fontFile);

      await fontFile.load();
    });
  `, );

  return name;
};

const shapeFromTextImage = async (page, args) => {
  const { base64png, ...shape } = await page.evaluate(`
    Promise.resolve().then(async () => {
      const { bitmap, ...shape } = confetti.shapeFromText(${JSON.stringify(args)});

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

      return {
        ...shape,
        base64png: canvas.toDataURL('image/png')
      };
    });
  `);

  return {
    ...shape,
    buffer: base64ToBuffer(base64png)
  };
};

test('[text] shapeFromText renders an emoji', async t => {
  const page = t.context.page = await fixturePage();

  const fontFace = await loadFont(page);

  const { buffer, ...shape } = await shapeFromTextImage(page, { text: '😀', fontFamily: `"${fontFace}"`, scalar: 10 });

  t.context.buffer = buffer;
  t.context.image = await readImage(buffer);

  t.deepEqual({
    hash: t.context.image.hash(),
    ...shape
  }, {
    type: 'bitmap',
    matrix: [ 0.1, 0, 0, 0.1, -5.7, -5.550000000000001 ],
    hash: 'c4y5z8b83AC'
  });
});

test('[text] shapeFromText works with just a string parameter', async t => {
  const page = t.context.page = await fixturePage();

  const shape = await page.evaluate(`
    confetti.shapeFromText("🍍");
  `);

  t.deepEqual(Object.keys(shape).sort(), ['type', 'bitmap', 'matrix'].sort());
  // the actual contents will differ from OS to OS, so just validate
  // the shape has some expected properties
  t.is(shape.type, 'bitmap');
  t.is(Array.isArray(shape.matrix), true);
  t.is(shape.matrix.length, 6);
});

test('[text] shapeFromText renders black text by default', async t => {
  const page = t.context.page = await fixturePage();

  const { buffer } = await shapeFromTextImage(page, { text: 'pie', scalar: 3 });

  t.context.buffer = buffer;
  t.context.image = await reduceImg(buffer);

  t.deepEqual(await uniqueColors(t.context.image), ['#000000', '#ffffff']);
});

test('[text] shapeFromText can optionally render text in a requested color', async t => {
  const page = t.context.page = await fixturePage();

  const { buffer } = await shapeFromTextImage(page, { text: 'pie', color: '#00ff00', scalar: 3 });

  t.context.buffer = buffer;
  t.context.image = await reduceImg(buffer);

  t.deepEqual(await uniqueColors(t.context.image), ['#00ff00', '#ffffff']);
});

// this test renders a black canvas in a headless browser
// but works fine when it is not headless
// eslint-disable-next-line ava/no-skip-test
test('[text] shoots confetti of an emoji shape', async t => {
  const page = t.context.page = await fixturePage();

  const fontFace = await loadFont(page);
  await page.evaluate(`window.__fontFamily = '"${fontFace}"'`);

  // these parameters should create an image
  // that is the same every time
  t.context.buffer = await confettiImage(page, {
    startVelocity: 0,
    gravity: 0,
    scalar: 10,
    flat: 1,
    ticks: 1000,
    // eslint-disable-next-line no-undef
    shapes: [() => confetti.shapeFromText({ text: '😀', fontFamily: __fontFamily, scalar: 10 })]
  });
  t.context.image = await readImage(t.context.buffer);

  t.is(t.context.image.hash(), 'cPpcSrcCjdC');
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

test('[custom canvas] can create instances of confetti in separate canvas', async t => {
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

test('[custom canvas] can use a custom canvas without resizing', async t => {
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

test('[custom canvas] resizes the custom canvas when the window resizes', async t => {
  await resizeTest(t, {
    resize: true
  });
});

test('[custom canvas] resizes the custom canvas when the window resizes and a worker is used', async t => {
  await resizeTest(t, {
    resize: true,
    useWorker: true
  });
});

test('[custom canvas] can use a custom canvas with workers and resize it', async t => {
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

test('[custom canvas] shoots confetti repeatedly in defaut and custom canvas using requestAnimationFrame', async t => {
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

test('[custom canvas] can initialize the same canvas multiple times when using a worker', async t => {
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

test('[custom canvas] can initialize the same canvas multiple times without using a worker', async t => {
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

test('[custom canvas] calling `reset` method clears all existing confetti but more can be launched after', async t => {
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

test('[browserify] works using the browserify bundle', async t => {
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

test('[minified] works using the terser minified and compressed code', async t => {
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

test('[esm] the esm module exposed confetti as the default', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff00ff']
  }, 'confettiAlias');

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff00ff', '#ffffff']);
});

test('[esm] the esm module exposed confetti.create as create', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  await injectCanvas(page, { allowResize: true }, 'createAlias');

  t.context.buffer = await confettiImage(page, {
    colors: ['#ff00ff']
  }, 'myConfetti');
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff00ff', '#ffffff']);
});

test('[esm] exposed confetti method has a `reset` property', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  t.is(await page.evaluate(`typeof confettiAlias.reset`), 'function');
});

test('[esm] exposed confetti method has a `shapeFromPath` property', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  t.is(await page.evaluate(`typeof confettiAlias.shapeFromPath`), 'function');
});

test('[esm] exposed confetti method has a `shapeFromText` property', async t => {
  const page = t.context.page = await fixturePage('fixtures/page.module.html');

  t.is(await page.evaluate(`typeof confettiAlias.shapeFromText`), 'function');
});
