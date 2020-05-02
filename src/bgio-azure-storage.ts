import { BlobServiceClient } from '@azure/storage-blob';
import { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';

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
  async setItem(id: string, value: any) {
    const payload = JSON.stringify(value);
    await this.blob(id).upload(payload, payload.length);
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

    const stream = blob.readableStreamBody;

    /* istanbul ignore next */
    if (stream == null) {
      throw new Error(`Body for ${id} is null`);
    }

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

  async keys(prefix: string) {
    const blobNames = [];

    const paginated = await this.container
      .listBlobsFlat({ prefix })
      .byPage({ maxPageSize: this.opts.pageSize });

    for await (const page of paginated) {
      for (const blob of page.segment.blobItems) {
        blobNames.push(blob.name);
      }
    }

    return blobNames;
  }
}

export interface AzureStorageOpts {
  client: BlobServiceClient;
  container: string;
  maxConcurrentRequests?: number;
  pageSize?: number;
}

const AzureStorageDefaults: Partial<AzureStorageOpts> = {
  maxConcurrentRequests: 10,
  pageSize: 50,
};

const INITIAL = 'initial/';
const LOG = 'log/';
const METADATA = 'metadata/';
const STATE = 'state/';

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

  async fetch<O extends StorageAPI.FetchOpts>(gameID: string, opts: O) {
    const result = {} as StorageAPI.FetchFields;

    await Promise.all([
      opts.state
        ? this.store.getItem(`${STATE}${gameID}`).then((value) => {
            result.state = value as State;
          })
        : Promise.resolve(),
      opts.metadata
        ? this.store.getItem(`${METADATA}${gameID}`).then((value) => {
            result.metadata = value as Server.GameMetadata;
          })
        : Promise.resolve(),
      opts.log
        ? this.store.getItem(`${LOG}${gameID}`).then((value) => {
            result.log = value as LogEntry[];
          })
        : Promise.resolve(),
      opts.initialState
        ? this.store.getItem(`${INITIAL}${gameID}`).then((value) => {
            result.initialState = value as State;
          })
        : Promise.resolve(),
    ]);

    return result as StorageAPI.FetchResult<O>;
  }

  async clear() {
    await this.store.clear();
  }

  async setState(id: string, state: State, deltalog?: LogEntry[]) {
    await Promise.all([
      this.setLog(id, deltalog),
      this.store.setItem(`${STATE}${id}`, state),
    ]);
  }

  async setMetadata(id: string, metadata: Server.GameMetadata) {
    await this.store.setItem(`${METADATA}${id}`, metadata);
  }

  async wipe(id: string) {
    await Promise.all([
      this.store.removeItem(`${STATE}${id}`),
      this.store.removeItem(`${INITIAL}${id}`),
      this.store.removeItem(`${METADATA}${id}`),
      this.store.removeItem(`${LOG}${id}`),
    ]);
  }

  async listGames() {
    const keys = await this.store.keys(METADATA);
    return keys.map((k) => k.substr(METADATA.length));
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
