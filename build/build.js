const fs = require('fs');
const { promisify } = require('util');

const { name, version, main } = require('../package.json');

const buildDate = (new Date()).toISOString();

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

function buildCommonJs(content) {
  return `// ${name} v${version} built on ${buildDate}
!(function (window, module) {
// source content
${content}
// end source content

  window.confetti = module.exports;
}(window, {}));
`;
}

function buildModule(content) {
  return `// ${name} v${version} built on ${buildDate}
var module = {};

// source content
${content}
// end source content

export default module.exports;
export var create = module.exports.create;
`;
}

mkdir('dist')
.then(() => readFile(main))
.then(file => {
  return Promise.all([
    writeFile('dist/confetti.browser.js', buildCommonJs(file)),
    writeFile('dist/confetti.module.mjs', buildModule(file))
  ]);
})
.catch(err => {
  console.error(err);
  process.exitCode = 1;
});
