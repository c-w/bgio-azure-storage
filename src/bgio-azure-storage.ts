import { BlobServiceClient, Metadata } from '@azure/storage-blob';
import { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';
import { promisify } from 'util';
import { createGunzip, gzip as gzipCallback } from 'zlib';

const gzip: (value: string) => Promise<Buffer> = promisify(gzipCallback);

export enum Compression {
  gzip = 'gzip',
}

class ClientAdapter {
  private opts: AzureStorageOpts;

  constructor(opts: AzureStorageOpts) {
    this.opts = opts;
  }

  private get container() {
    return this.opts.client.getContainerClient(this.opts.container);
  }

  private blob(id: string) {
    return this.container.getBlockBlobClient(id);
  }

  async init() {
    try {
      await this.container.create();
    } catch (error) {
      /* istanbul ignore next */
      if (error.statusCode !== 409) {
        throw error;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async setItem(id: string, value: any, metadata?: Metadata) {
    const serialized = JSON.stringify(value);

    const payload =
      this.opts.compression === Compression.gzip
        ? await gzip(serialized)
        : Buffer.from(serialized, 'utf-8');

    if (this.opts.compression) {
      metadata = { ...metadata, compression: this.opts.compression };
    }

    await this.blob(id).upload(payload, payload.length, { metadata });
  }

  async getItem(id: string) {
    let blob;
    try {
      blob = await this.blob(id).download();
    } catch (error) {
      /* istanbul ignore next */
      if (error.statusCode !== 404) {
        throw error;
      }
      return undefined;
    }

    const blobStream = blob.readableStreamBody;

    /* istanbul ignore next */
    if (blobStream == null) {
      throw new Error(`Body for ${id} is null`);
    }

    const stream =
      blob.metadata?.compression === Compression.gzip
        ? blobStream.pipe(createGunzip())
        : blobStream;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise<any>((resolve, reject) => {
      const chunks: string[] = [];
      stream.on('data', (data) => {
        chunks.push(data.toString());
      });
      stream.on('end', () => {
        resolve(JSON.parse(chunks.join('')));
      });
      stream.on('error', reject);
    });
  }

  async removeItem(id: string) {
    try {
      await this.blob(id).delete();
    } catch (error) {
      /* istanbul ignore next */
      if (error.statusCode !== 404) {
        throw error;
      }
    }
  }

  async clear() {
    const paginated = this.container
      .listBlobsFlat()
      .byPage({ maxPageSize: this.opts.maxConcurrentRequests });

    for await (const page of paginated) {
      await Promise.all(
        page.segment.blobItems.map((blob) => this.removeItem(blob.name))
      );
    }
  }

  async blobs(prefix: string) {
    const blobs = [];

    const paginated = this.container
      .listBlobsFlat({ prefix, includeMetadata: true })
      .byPage({ maxPageSize: this.opts.pageSize });

    for await (const page of paginated) {
      for (const blob of page.segment.blobItems) {
        blobs.push(blob);
      }
    }

    return blobs;
  }
}

export interface AzureStorageOpts {
  client: BlobServiceClient;
  container: string;
  maxConcurrentRequests?: number;
  pageSize?: number;
  compression?: Compression;
}

const AzureStorageDefaults: Partial<AzureStorageOpts> = {
  maxConcurrentRequests: 10,
  pageSize: 50,
};

const INITIAL = 'initial/';
const LOG = 'log/';
const METADATA = 'metadata/';
const STATE = 'state/';
const METADATA_IS_GAMEOVER = 'isgameover';
const METADATA_GAME_NAME = 'gamename';
const METADATA_UPDATED_AT = 'updatedat';

export class AzureStorage extends Async {
  private store: ClientAdapter;

  constructor(opts: AzureStorageOpts) {
    super();
    this.store = new ClientAdapter({ ...AzureStorageDefaults, ...opts });
  }

  async connect() {
    await this.store.init();
  }

  async createGame(gameID: string, opts: StorageAPI.CreateGameOpts) {
    await Promise.all([
      this.store.setItem(`${INITIAL}${gameID}`, opts.initialState),
      this.setState(gameID, opts.initialState),
      this.setMetadata(gameID, opts.metadata),
    ]);
  }

  async fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O) {
    const result = {} as StorageAPI.FetchFields;

    await Promise.all([
      opts.state
        ? this.store.getItem(`${STATE}${matchID}`).then((value) => {
            result.state = value as State;
          })
        : Promise.resolve(),
      opts.metadata
        ? this.store.getItem(`${METADATA}${matchID}`).then((value) => {
            result.metadata = value as Server.MatchData;
          })
        : Promise.resolve(),
      opts.log
        ? this.store.getItem(`${LOG}${matchID}`).then((value) => {
            result.log = value as LogEntry[];
          })
        : Promise.resolve(),
      opts.initialState
        ? this.store.getItem(`${INITIAL}${matchID}`).then((value) => {
            result.initialState = value as State;
          })
        : Promise.resolve(),
    ]);

    return result as StorageAPI.FetchResult<O>;
  }

  async clear() {
    await this.store.clear();
  }

  async setState(matchID: string, state: State, deltalog?: LogEntry[]) {
    await Promise.all([
      this.setLog(matchID, deltalog),
      this.store.setItem(`${STATE}${matchID}`, state),
    ]);
  }

  async setMetadata(matchID: string, metadata: Server.MatchData) {
    const blobMetadata: Metadata = {};

    if (metadata.gameName) {
      blobMetadata[METADATA_GAME_NAME] = metadata.gameName;
    }

    if (metadata.updatedAt) {
      blobMetadata[METADATA_UPDATED_AT] = metadata.updatedAt.toString();
    }

    if (metadata.gameover != null) {
      blobMetadata[METADATA_IS_GAMEOVER] = metadata.gameName ? 'true' : 'false';
    }

    await this.store.setItem(`${METADATA}${matchID}`, metadata, blobMetadata);
  }

  async wipe(matchID: string) {
    await Promise.all([
      this.store.removeItem(`${STATE}${matchID}`),
      this.store.removeItem(`${INITIAL}${matchID}`),
      this.store.removeItem(`${METADATA}${matchID}`),
      this.store.removeItem(`${LOG}${matchID}`),
    ]);
  }

  async listGames(opts?: StorageAPI.ListGamesOpts) {
    const blobs = await this.store.blobs(METADATA);

    return blobs
      .filter((blob) => {
        if (!blob.metadata) {
          return true;
        }

        const gameName = blob.metadata[METADATA_GAME_NAME];
        const updatedAt = Number(blob.metadata[METADATA_UPDATED_AT]);
        const isGameOver = blob.metadata[METADATA_IS_GAMEOVER] === 'true';

        if (opts?.gameName != null && gameName !== opts.gameName) {
          return false;
        }

        if (
          opts?.where?.updatedAfter != null &&
          updatedAt <= opts.where.updatedAfter
        ) {
          return false;
        }

        if (
          opts?.where?.updatedBefore != null &&
          updatedAt >= opts.where.updatedBefore
        ) {
          return false;
        }

        if (
          opts?.where?.isGameover != null &&
          isGameOver !== opts.where.isGameover
        ) {
          return false;
        }

        return true;
      })
      .map((blob) => blob.name.substr(METADATA.length));
  }

  private async setLog(id: string, deltalog?: LogEntry[]) {
    if (!deltalog || !deltalog.length) {
      return;
    }

    const key = `${LOG}${id}`;

    const oldLog = (await this.store.getItem(key)) as LogEntry[];
    const newLog = (oldLog || []).concat(deltalog);

    await this.store.setItem(key, newLog);
  }
}
