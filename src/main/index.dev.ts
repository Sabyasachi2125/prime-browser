/* eslint-disable no-console */

if (typeof process.env.NODE_ENV === 'string') {
  // we don't have to reassign the value to `process.env.NODE_ENV`
  // since above webpack 4, the value has been set automatically
  // in built files according to the `mode` variable
} else {
  // Set environment for development
  process.env.NODE_ENV = 'development';
}

// Require `main` process to boot app
require('./index');
