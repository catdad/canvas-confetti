const path = require('path');
const http = require('http');
const send = require('send');
const root = require('rootrequire');

const PORT = 9001;

http.createServer(function (req, res) {
  const url = req.url === '/' ? '/index.html' : req.url;
  const file = path.resolve(root, url.slice(1));

  console.log(req.method, url, '->', file);

  const cspRules = [
    `default-src 'self' https://cdnjs.cloudflare.com`,
    `img-src * data: blob:`,
    `media-src * data: blob:`,
    `font-src https://fonts.googleapis.com https://fonts.gstatic.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com`,
    `worker-src 'self' blob:`
  ];

  res.setHeader('content-security-policy', cspRules.join('; '));

  send(req, file).pipe(res);
}).listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});


// twitch csp... see !112
//  default-src 'self' https://6rh8h42nhnjmirlyxc0w9lbpmeehi0.ext-twitch.tv
//  block-all-mixed-content
//  img-src * data: blob:
//  media-src * data: blob:
//  frame-ancestors https://supervisor.ext-twitch.tv https://extension-files.twitch.tv https://*.twitch.tv https://*.twitch.tech https://localhost.twitch.tv:* https://localhost.twitch.tech:* http://localhost.rig.twitch.tv:*
//  font-src https://6rh8h42nhnjmirlyxc0w9lbpmeehi0.ext-twitch.tv https://fonts.googleapis.com https://fonts.gstatic.com
//  style-src 'self' 'unsafe-inline' https://6rh8h42nhnjmirlyxc0w9lbpmeehi0.ext-twitch.tv https://fonts.googleapis.com
//  connect-src https: wss: https://www.google-analytics.com https://stats.g.doubleclick.net
//  script-src 'self' https://6rh8h42nhnjmirlyxc0w9lbpmeehi0.ext-twitch.tv https://extension-files.twitch.tv https://www.google-analytics.com
