module.exports = {
  apps: [
    {
      name: 'azurite',
      script: 'node_modules/.bin/azurite',
      args: '-l azurite',
    },
  ],
};
