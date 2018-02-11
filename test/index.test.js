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

// Docker-based CIs need this disabled
// https://github.com/Quramy/puppeteer-example/blob/c28a5aa52fe3968c2d6cfca362ec28c36963be26/README.md#with-docker-based-ci-services
const args = process.env.CI ? [
  '--no-sandbox', '--disable-setuid-sandbox'
] : [];

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

    return puppeteer.launch({ headless: true, args }).then(thisBrowser => {
      browser = thisBrowser;
      return Promise.resolve(browser);
    });
  };
})();

const testPage = async () => {
  const browser = await testBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 500, height: 500});

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

function confetti(opts, wait = false) {
  return `
${wait ? '' : 'confetti.Promise = null;'}
confetti(${opts ? JSON.stringify(opts) : ''});
`;
}

async function confettiImage(page, opts = {}) {
  const base64png = await page.evaluate(`
  confetti(${JSON.stringify(opts)});
  new Promise(function (resolve, reject) {
    setTimeout(function () {
      var canvas = document.querySelector('canvas');
      return resolve(canvas.toDataURL('image/png'));
    }, 200);
  });
`);

  const imageData = base64png.replace(/data:image\/png;base64,/, '');
  return new Buffer(imageData, 'base64');
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

const readImage = async (buffer) => {
  return await (Buffer.isBuffer(buffer) ? jimp.read(buffer) : Promise.resolve(buffer));
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

const removeOpacity = async (buffer) => {
  const image = await jimp.read(buffer);
  image.rgba(false).background(0xFFFFFFFF);
  var opaqueBuffer = await promisify(image.getBuffer.bind(image))(jimp.MIME_PNG);

  return await jimp.read(opaqueBuffer);
};

const reduceImg = async (buffer, opaque = true) => {
  const image = opaque ?
    await await removeOpacity(buffer) :
    await jimp.read(buffer);

  // basically dialate the crap out of everything
  image.blur(2);
  image.posterize(1);

  return image;
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
  t.context.passing = false;
});
test.afterEach((t) => {
  t.context.passing = true;
});

test.afterEach.always(async t => {
  if (t.context.passing && !process.env['CONFETTI_SHOW']) {
    return;
  }

  // this is allowed, but still needs the eslint plugin to be updated
  // https://github.com/avajs/eslint-plugin-ava/issues/176
  // eslint-disable-next-line ava/use-t-well
  const name = t.title.replace(/^afterEach for /, '');

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
  const page = await fixturePage();

  t.context.buffer = await confettiImage(page);
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.is(pixels.length, 8);
});

test('shoots red confetti', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti({
    colors: ['#ff0000']
  }));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#ff0000', '#ffffff']);
});

test('shoots blue confetti', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti({
    colors: ['#0000ff']
  }));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#0000ff', '#ffffff']);
});

test('shoots confetti to the left', async t => {
  const page = await fixturePage();

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
  const page = await fixturePage();

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

test('uses promises when available', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti({}, true));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  // make sure that all confetti have disappeared
  t.deepEqual(pixels, ['#ffffff']);
});

test('removes the canvas when done', async t => {
  const page = await fixturePage();

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

/*
 * Browserify tests
 */

test('works using the browserify bundle', async t => {
  const page = await fixturePage('fixtures/page.browserify.html');

  await page.evaluate(confetti({
    colors: ['#00ff00']
  }));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);

  t.deepEqual(pixels, ['#00ff00', '#ffffff']);
});
