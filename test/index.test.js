import http from 'http';
import path from 'path';

import test from 'ava';
import puppeteer from 'puppeteer';
import send from 'send';
import root from 'rootrequire';

const PORT = 9999;

const testServer = (function startServer() {
  let server;

  return function () {
    return new Promise((resolve) => {
      if (server) {
        return resolve();
      }

      server = http.createServer(function (req, res) {
        var file = path.resolve(root, req.url.slice(1));
        send(req, file).pipe(res);
      }).listen(PORT, () => {
        resolve();
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
});

test('browses to the thing', async t => {
  const page = await testPage();
  await page.goto(`http://localhost:${PORT}/fixtures/page.html`);

  t.pass();
});
