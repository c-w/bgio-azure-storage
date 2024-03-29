# bgio-azure-storage

[![NPM Version](https://img.shields.io/npm/v/bgio-azure-storage)](https://www.npmjs.com/package/bgio-azure-storage)
[![CI Status](https://github.com/c-w/bgio-azure-storage/workflows/CI/badge.svg)](https://github.com/c-w/bgio-azure-storage/actions)
[![Coverage Status](https://coveralls.io/repos/github/c-w/bgio-azure-storage/badge.svg?branch=master)](https://coveralls.io/github/c-w/bgio-azure-storage?branch=master)

> Azure Storage database connector for [boardgame.io](https://boardgame.io/)

This package provides a database connector that allows you to use an [Azure Storage](https://azure.microsoft.com/en-us/services/storage/) account to store boardgame.io metadata and game state.

## Installation

```sh
npm install --save bgio-azure-storage
```

## Versioning

The major and minor versions of this package follow the major and minor versions of the upstream [boardgame.io package](https://www.npmjs.com/package/boardgame.io).

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
