const path = require('path');

module.exports = {
  apps: [
    {
      name: 'azurite',
      cwd: __dirname,
      script: path.join('node_modules', 'azurite', 'dist', 'src', 'azurite.js'),
      args: '-l azurite',
    },
  ],
};
