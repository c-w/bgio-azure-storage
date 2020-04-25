# bgio-azure-storage

[![NPM Version](https://img.shields.io/npm/v/bgio-azure-storage)](https://www.npmjs.com/package/bgio-azure-storage)

> Azure Storage database connector for [boardgame.io](https://boardgame.io/)

This package provides a database connector that allows you to use an [Azure Storage](https://azure.microsoft.com/en-us/services/storage/) account to store boardgame.io metadata and game state.

## Installation

```sh
npm install --save bgio-azure-storage
```

## Usage

```js
const { AzureStorage } = require('bgio-azure-storage');
const { BlobServiceClient } = require('@azure/storage-blob');
const { Server } = require('boardgame.io/server');
const { MyGame } = require('./game');

const database = new AzureStorage({
  client: BlobServiceClient.fromConnectionString('enter your connection string here'),
  container: 'boardgameio',
});

const server = Server({
  games: [MyGame],
  db: database,
});

server.run(8000);
```
