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

function hex(n) {
  const pad = (n) => {
    while (n.length < 2) {
      n = '0'+n;
    }
    return n;
  };

  return pad(n.toString(16));
}

const uniqueColors = async (buffer) => {
  const image = Buffer.isBuffer(buffer) ? await jimp.read(buffer) : buffer;
  const pixels = new Set();

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
    const r = image.bitmap.data[idx + 0];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];

    pixels.add(`#${hex(r)}${hex(g)}${hex(b)}`);
  });

  return Array.from(pixels);
};

const reduceImg = async (buffer) => {
  const image = await jimp.read(buffer);

  // basically dialate the crap out of everything
  image.blur(2);
  image.posterize(1);

  return image;
};

test.before(async () => {
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

test.afterEach.always(async (t) => {
  if (t.context.passing) {
    return;
  }

  // this is allowed, but still needs the eslint plugin to be updated
  // https://github.com/avajs/eslint-plugin-ava/issues/176
  // eslint-disable-next-line ava/use-t-well
  const name = t.title.replace(/^afterEach for /, '');

  await promisify(fs.writeFile)(`shots/${name}.original.png`, t.context.buffer);
  await promisify(t.context.image.write.bind(t.context.image))(`shots/${name}.reduced.png`);
});

test('shoots default confetti', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti());

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);
  pixels.sort();

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
  pixels.sort();

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
  pixels.sort();

  t.deepEqual(pixels, ['#0000ff', '#ffffff']);
});

test('uses promises when available', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti({}, true));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);
  pixels.sort();

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

test('works using the browserify bundle', async t => {
  const page = await fixturePage('fixtures/page.browserify.html');

  await page.evaluate(confetti({
    colors: ['#00ff00']
  }));

  t.context.buffer = await page.screenshot({ type: 'png' });
  t.context.image = await reduceImg(t.context.buffer);

  const pixels = await uniqueColors(t.context.image);
  pixels.sort();

  t.deepEqual(pixels, ['#00ff00', '#ffffff']);
});
