import http from 'http';
import path from 'path';
import { promisify } from 'util';

import test from 'ava';
import puppeteer from 'puppeteer';
import send from 'send';
import root from 'rootrequire';
import jimp from 'jimp';

const PORT = 9999;

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

    return puppeteer.launch({ headless: false }).then(thisBrowser => {
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

const fixturePage = async () => {
  const page = await testPage();
  await page.goto(`http://localhost:${PORT}/fixtures/page.html`);

  return page;
};

const sleep = (time) => {
  return new Promise(resolve => {
    setTimeout(() => resolve(), time);
  });
};

function confetti(opts) {
  return `confetti(${opts ? JSON.stringify(opts) : ''});`;
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

const reduceImg = async (buffer, name) => {
  const image = await jimp.read(buffer);

  // basically dialate the crap out of everything
  image.blur(10);
  image.posterize(0.1);

  await promisify(image.write.bind(image))(name);

  return image;
};

test.before(async () => {
  await testServer();
  await testBrowser();
});

test.after(async () => {
  // wait a while, so I can see the browser
  await new Promise(resolve => {
    setTimeout(resolve, 10 * 1000);
  });

  const browser = await testBrowser();
  await browser.close();

  const server = await testServer();
  await new Promise(resolve => {
    server.close(() => resolve());
  });
});

test('shoots default confetti', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti());

  const buffer = await page.screenshot({
    path: path.resolve(root, 'shots/0.png'),
    type: 'png'
  });

  const image = await reduceImg(buffer, 'shots/0-reduced.png');

  const pixels = await uniqueColors(image);
  pixels.sort();

  t.is(pixels.length, 8);
});

test('shoots red confetti', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti({
    colors: ['#ff0000']
  }));

  const buffer = await page.screenshot({
    path: path.resolve(root, 'shots/1.png'),
    type: 'png'
  });

  const image = await reduceImg(buffer, 'shots/1-reduced.png');

  const pixels = await uniqueColors(image);
  pixels.sort();

  t.deepEqual(pixels, ['#ff0000', '#ffffff']);
});

test('shoots blue confetti', async t => {
  const page = await fixturePage();

  await page.evaluate(confetti({
    colors: ['#0000ff']
  }));

  const buffer = await page.screenshot({
    path: path.resolve(root, 'shots/2.png'),
    type: 'png'
  });

  const image = await reduceImg(buffer, 'shots/2-reduced.png');

  const pixels = await uniqueColors(image);
  pixels.sort();

  t.deepEqual(pixels, ['#0000ff', '#ffffff']);
});
