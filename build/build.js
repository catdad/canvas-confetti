const fs = require('fs');
const { promisify } = require('util');

const { name, version, main } = require('../package.json');

function mkdir(dir) {
  return promisify(fs.mkdir)(dir).then(() => {
    return Promise.resolve();
  }).catch(err => {
    if (err.code === 'EEXIST') {
      return Promise.resolve();
    }

    return Promise.reject(err);
  });
}

function readFile(file, encoding) {
  return promisify(fs.readFile)(file, encoding);
}

function writeFile(file, content) {
  return promisify(fs.writeFile)(file, content);
}

function buildFile(content) {
  return `// ${name} v${version} built on ${(new Date()).toISOString()}
!(function (window) {
  var module = {};

// source content
${content}
// end source content

  window.confetti = module.exports;
}(window));
`;
}

mkdir('dist')
.then(() => readFile(main))
.then(file => writeFile('dist/confetti.browser.js', buildFile(file)))
.catch(err => {
  console.error(err);
  process.exitCode = 1;
});
