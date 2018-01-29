import http from 'http';

import test from 'ava';
import puppeteer from 'puppeteer';

const PORT = 9999;

const testServer = (function startServer() {
  let server;

  return function () {
    return new Promise((resolve, reject) => {
      if (server) {
        return resolve();
      }

      server = http.createServer(function (req, res) {
        res.end('sdgdasgdasg adsgsda gdfa gdfsg fds gsdf');
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
  const browser = await testBrowser();
  await browser.close();
});

test('browses to the thing', async t => {
  const page = await testPage();
  await page.goto(`http://localhost:${PORT}`);

  t.pass();
});
