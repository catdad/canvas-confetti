import vm from 'vm';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

import test from 'ava';
import root from 'rootrequire';

import pkg from '../package.json';

test('can be evaluated in a node vm', async t => {
  const file = await promisify(fs.readFile)(path.resolve(root, pkg.main), 'utf8');
  t.is(typeof file, 'string');

  const context = vm.createContext({ module: {} });
  vm.runInContext(file, context);

  t.is(typeof context.module.exports, 'function');
  t.is(typeof context.module.exports.create, 'function');
  t.is(typeof context.module.exports.reset, 'function');
});
