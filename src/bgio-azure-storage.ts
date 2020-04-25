import { BlobServiceClient } from '@azure/storage-blob';
import { KeyValue, KeyValueStore } from './keyvalue';

class BlobServiceClientAdapter implements KeyValueStore {
  private client: BlobServiceClient;
  private containerName: string;

  constructor(client: BlobServiceClient, containerName: string) {
    this.client = client;
    this.containerName = containerName;
  }

  private get container() {
    return this.client.getContainerClient(this.containerName);
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

    return new Promise<any>((resolve, reject) => {
      const chunks: string[] = [];
      stream.on('data', data => {
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
    for (const id of await this.keys()) {
      await this.removeItem(id);
    }
  }

  async keys() {
    const blobNames = [];

    const blobs = await this.container.listBlobsFlat();

    for await (const blob of blobs) {
      blobNames.push(blob.name);
    }

    return blobNames;
  }
}

export interface AzureStorageOpts {
  client: BlobServiceClient;
  container: string;
}

export class AzureStorage extends KeyValue {
  constructor({ client, container }: AzureStorageOpts) {
    super(new BlobServiceClientAdapter(client, container), {});
  }
}
