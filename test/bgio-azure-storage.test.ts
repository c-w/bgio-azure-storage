import { BlobServiceClient } from '@azure/storage-blob';
import { State, Server, LogEntry } from 'boardgame.io';
import { AzureStorage } from '../src/bgio-azure-storage';

describe('AzureStorage', () => {
  let db: AzureStorage;

  beforeAll(async () => {
    db = new AzureStorage({
      client: BlobServiceClient.fromConnectionString(
        'UseDevelopmentStorage=true'
      ),
      container: 'test',
    });
    await db.connect();
  });

  afterEach(async () => {
    await db.clear();
  });

  test('basic', async () => {
    // Must return undefined when no game exists.
    const result = await db.fetch('gameID', { state: true });
    expect(result.state).toEqual(undefined);

    // Create game.
    const state: unknown = { a: 1 };
    const metadata: unknown = { metadata: true };

    await db.createGame('gameID', {
      initialState: state as State,
      metadata: metadata as Server.MatchData,
    });

    // Must return created game.
    {
      const result = await db.fetch('gameID', {
        state: true,
        metadata: true,
        initialState: true,
      });
      expect(result.state).toEqual({ a: 1 });
      expect(result.initialState).toEqual(result.state);
      expect(result.metadata).toEqual({ metadata: true });
    }

    // Must return all keys
    const keys = await db.listGames();
    expect(keys).toEqual(['gameID']);

    // Must remove game from DB
    await db.wipe('gameID');
    expect(
      await db.fetch('gameID', { metadata: true, state: true, log: true })
    ).toEqual({});

    // Shall not return error
    await db.wipe('gameID');

    // Shall create game, then clear DB, then check whether DB is cleared
    await db.setState('game2', state as State);
    await db.clear();
    const keys2 = await db.listGames();
    expect(keys2).toHaveLength(0);
  });

  test('log', async () => {
    const logEntry1: LogEntry = {
      _stateID: 0,
      action: {
        type: 'MAKE_MOVE',
        payload: { type: '', playerID: '0', args: [] },
      },
      turn: 0,
      phase: '',
    };

    const logEntry2: LogEntry = {
      _stateID: 1,
      action: {
        type: 'MAKE_MOVE',
        payload: { type: '', playerID: '0', args: [] },
      },
      turn: 1,
      phase: '',
    };

    await db.setState('gameIDlog', null as any, [logEntry1]); // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.setState('gameIDlog', null as any, [logEntry2]); // eslint-disable-line @typescript-eslint/no-explicit-any

    const result = await db.fetch('gameIDlog', { log: true });
    expect(result.log).toEqual([logEntry1, logEntry2]);
  });
});
