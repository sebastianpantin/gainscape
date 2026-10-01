import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVATE_MESSAGE } from '../../web/src/pwa/shell-rules.ts';
import {
  ACTIVATE_TIMEOUT_MS,
  createUpdateFlow,
  type LocksPort,
  RELOAD_PING,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdatePorts,
  type WorkerPort,
} from '../../web/src/pwa/update-flow.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const lockName = `gainscape.finish.${userId}`;

class FakeWorker implements WorkerPort {
  state = 'installed';
  messages: unknown[] = [];
  private listeners: (() => void)[] = [];
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  addEventListener(_type: 'statechange', listener: () => void) {
    this.listeners.push(listener);
  }
  becomes(state: string) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

class FakeLocks implements LocksPort {
  held = new Set<string>();
  requests: { name: string; ifAvailable: boolean }[] = [];
  private queue = new Map<string, (() => void)[]>();

  request<T>(name: string, ...rest: unknown[]): Promise<T> {
    const callback = rest[rest.length - 1] as (lock: unknown) => Promise<T>;
    const ifAvailable = rest.length === 2 && (rest[0] as { ifAvailable: boolean }).ifAvailable;
    this.requests.push({ name, ifAvailable });
    if (ifAvailable && this.held.has(name)) return callback(null);
    return new Promise<void>((resolve) => {
      if (!this.held.has(name)) resolve();
      else this.queue.set(name, [...(this.queue.get(name) ?? []), resolve]);
    }).then(async () => {
      this.held.add(name);
      try {
        return await callback({ name });
      } finally {
        this.release(name);
      }
    });
  }

  holdElsewhere(name: string): () => void {
    this.held.add(name);
    return () => this.release(name);
  }

  private release(name: string) {
    this.held.delete(name);
    const next = this.queue.get(name)?.shift();
    next?.();
  }
}

function setup(
  options: {
    waiting?: boolean;
    controller?: boolean;
    locks?: boolean;
    signedIn?: boolean;
    hadControllerAtLoad?: boolean;
    installing?: FakeWorker;
  } = {},
) {
  const order: string[] = [];
  const controllerListeners: (() => void)[] = [];
  const updateFoundListeners: (() => void)[] = [];
  const waiting = options.waiting === false ? null : new FakeWorker();
  const registration = {
    waiting: waiting as FakeWorker | null,
    installing: (options.installing ?? null) as FakeWorker | null,
    update: vi.fn(async () => undefined),
    addEventListener: (_type: 'updatefound', listener: () => void) => updateFoundListeners.push(listener),
  };
  const serviceWorker = {
    controller: (options.controller === false ? null : { id: 'old' }) as unknown,
    addEventListener: (_type: 'controllerchange', listener: () => void) => controllerListeners.push(listener),
  };
  const locks = options.locks === false ? null : new FakeLocks();
  let clock = 0;
  const channelListeners: ((event: MessageEvent<unknown>) => void)[] = [];
  const channel = {
    sent: [] as unknown[],
    postMessage(message: unknown) {
      this.sent.push(message);
    },
    addEventListener: (_type: 'message', listener: (event: MessageEvent<unknown>) => void) =>
      channelListeners.push(listener),
  };
  const ping = (data: unknown) => {
    for (const listener of channelListeners) listener({ data } as MessageEvent<unknown>);
  };
  const ports: UpdatePorts = {
    registration,
    serviceWorker,
    locks,
    channel,
    flushDrafts: vi.fn(async () => {
      order.push('flush');
    }),
    reload: vi.fn(() => {
      order.push('reload');
    }),
    now: () => clock,
    userId: () => (options.signedIn === false ? null : userId),
    hadControllerAtLoad: options.hadControllerAtLoad ?? options.controller !== false,
  };
  if (locks) {
    const request = locks.request.bind(locks);
    locks.request = ((name: string, ...rest: unknown[]) => {
      order.push('lock');
      return (request as (name: string, ...rest: unknown[]) => Promise<unknown>)(name, ...rest);
    }) as FakeLocks['request'];
  }
  const flow = createUpdateFlow(ports);
  const changeController = () => {
    serviceWorker.controller = { id: 'new' };
    for (const listener of controllerListeners) listener();
  };
  const installUpdate = (worker: FakeWorker) => {
    worker.state = 'installing';
    registration.installing = worker;
    for (const listener of updateFoundListeners) listener();
    registration.installing = null;
    registration.waiting = worker;
    worker.becomes('installed');
  };
  return {
    flow,
    ports,
    order,
    waiting,
    registration,
    serviceWorker,
    locks,
    changeController,
    installUpdate,
    channel,
    ping,
    tick: (ms: number) => (clock += ms),
  };
}

async function settle() {
  for (let step = 0; step < 10; step++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('update detection', () => {
  it('is ready when a worker is waiting and a controller exists', () => {
    expect(setup().flow.state()).toBe('ready');
  });

  it('stays idle on a first install with no controller', () => {
    expect(setup({ controller: false }).flow.state()).toBe('idle');
  });

  it('becomes ready when an update finishes installing', () => {
    const { flow, installUpdate } = setup({ waiting: false });
    expect(flow.state()).toBe('idle');
    installUpdate(new FakeWorker());
    expect(flow.state()).toBe('ready');
  });

  it('becomes ready when an update was already installing at start-up', () => {
    const worker = new FakeWorker();
    worker.state = 'installing';
    const { flow, registration } = setup({ waiting: false, installing: worker });
    expect(flow.state()).toBe('idle');
    registration.installing = null;
    registration.waiting = worker;
    worker.becomes('installed');
    expect(flow.state()).toBe('ready');
  });

  it('notices a waiting worker after a visibility check', async () => {
    const { flow, registration, tick } = setup({ waiting: false });
    tick(UPDATE_CHECK_INTERVAL_MS);
    registration.update.mockImplementation(async () => {
      registration.waiting = new FakeWorker();
    });
    flow.checkOnVisible();
    await settle();
    expect(flow.state()).toBe('ready');
  });

  it('fails instead of hanging when flushing throws', async () => {
    const { flow, ports } = setup();
    vi.mocked(ports.flushDrafts).mockRejectedValueOnce(new Error('flush_failed'));
    await flow.apply();
    expect(flow.state()).toBe('failed');
  });

  it('checks for updates on visibility at most once per interval', () => {
    const { flow, registration, tick } = setup();
    flow.checkOnVisible();
    expect(registration.update).not.toHaveBeenCalled();
    tick(UPDATE_CHECK_INTERVAL_MS);
    flow.checkOnVisible();
    flow.checkOnVisible();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('reports a download that went redundant', async () => {
    const { flow, registration } = setup({ waiting: false });
    const worker = new FakeWorker();
    worker.state = 'installing';
    registration.update.mockImplementation(async () => {
      registration.installing = worker;
      setTimeout(() => {
        registration.installing = null;
        worker.becomes('redundant');
      }, 100);
    });
    const checking = flow.checkForUpdates();
    await vi.advanceTimersByTimeAsync(100);
    expect(await checking).toBe('download_failed');
    expect(flow.state()).toBe('idle');
  });

  it('reports the result of a manual check', async () => {
    expect(await setup().flow.checkForUpdates()).toBe('ready');
    expect(await setup({ waiting: false }).flow.checkForUpdates()).toBe('up_to_date');
  });
});

describe('applying an update', () => {
  it('flushes before taking the lock, posts the activate message once and reloads on controllerchange', async () => {
    const { flow, order, waiting, changeController, ports, locks } = setup();
    const applying = flow.apply();
    await settle();
    expect(order.slice(0, 2)).toEqual(['flush', 'lock']);
    expect(waiting!.messages).toEqual([{ type: ACTIVATE_MESSAGE }]);
    expect(ports.reload).not.toHaveBeenCalled();
    changeController();
    await settle();
    expect(ports.reload).toHaveBeenCalledTimes(1);
    expect(flow.state()).toBe('reloading');
    expect(locks!.held.has(lockName)).toBe(true);
    expect(locks!.requests).toEqual([{ name: lockName, ifAvailable: true }]);
    void applying;
  });

  it('waits for a finish lock held elsewhere before posting the message', async () => {
    const { flow, waiting, changeController, ports, locks } = setup();
    const release = locks!.holdElsewhere(lockName);
    void flow.apply();
    await settle();
    expect(flow.state()).toBe('waiting_for_finish');
    expect(waiting!.messages).toEqual([]);
    release();
    await settle();
    expect(waiting!.messages).toEqual([{ type: ACTIVATE_MESSAGE }]);
    changeController();
    await settle();
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });

  it('fails after the timeout, releases the lock and retries on Try again', async () => {
    const { flow, waiting, changeController, ports, locks } = setup();
    void flow.apply();
    await settle();
    await vi.advanceTimersByTimeAsync(ACTIVATE_TIMEOUT_MS);
    await settle();
    expect(flow.state()).toBe('failed');
    expect(locks!.held.has(lockName)).toBe(false);
    void flow.apply();
    await settle();
    expect(waiting!.messages).toHaveLength(2);
    changeController();
    await settle();
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });

  it('requests no lock when signed out', async () => {
    const { flow, locks, waiting } = setup({ signedIn: false });
    void flow.apply();
    await settle();
    expect(locks!.requests).toEqual([]);
    expect(waiting!.messages).toHaveLength(1);
  });

  it('proceeds without navigator.locks', async () => {
    const { flow, waiting, changeController, ports } = setup({ locks: false });
    void flow.apply();
    await settle();
    expect(waiting!.messages).toHaveLength(1);
    changeController();
    await settle();
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads without a message when another tab applied the update while it waited', async () => {
    const { flow, waiting, registration, changeController, ports, locks } = setup();
    const release = locks!.holdElsewhere(lockName);
    void flow.apply();
    await settle();
    registration.waiting = null;
    changeController();
    release();
    await settle();
    expect(waiting!.messages).toEqual([]);
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });

  it('returns to idle when the waiting worker went away without a controller change', async () => {
    const { flow, waiting, registration, ports, locks } = setup();
    const release = locks!.holdElsewhere(lockName);
    void flow.apply();
    await settle();
    registration.waiting = null;
    release();
    await settle();
    expect(waiting!.messages).toEqual([]);
    expect(ports.reload).not.toHaveBeenCalled();
    expect(flow.state()).toBe('idle');
  });

  it('does not queue a second reload or lock request through the passive path', async () => {
    const { flow, changeController, ports, locks } = setup();
    void flow.apply();
    await settle();
    changeController();
    await settle();
    changeController();
    await settle();
    expect(ports.reload).toHaveBeenCalledTimes(1);
    expect(locks!.requests).toHaveLength(1);
  });

  it('still reloads through the passive path after a late controllerchange', async () => {
    const { flow, changeController, ports } = setup();
    void flow.apply();
    await settle();
    await vi.advanceTimersByTimeAsync(ACTIVATE_TIMEOUT_MS);
    expect(flow.state()).toBe('failed');
    changeController();
    await settle();
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });
});

describe('a passive tab', () => {
  it('tells other tabs to reload once it applied the update', async () => {
    const { flow, changeController, channel } = setup();
    void flow.apply();
    await settle();
    changeController();
    await settle();
    expect(channel.sent).toEqual([{ type: RELOAD_PING }]);
  });

  it('reloads an uncontrolled tab on a reload ping, after the flush and its finish lock', async () => {
    const { ping, order, ports } = setup({ waiting: false, controller: false });
    ping({ type: 'something-else' });
    await settle();
    expect(ports.reload).not.toHaveBeenCalled();
    ping({ type: RELOAD_PING });
    await settle();
    expect(order).toEqual(['flush', 'lock', 'reload']);
  });

  it('flushes, takes its finish lock and reloads on controllerchange', async () => {
    const { changeController, ports, order, locks } = setup({ waiting: false });
    const release = locks!.holdElsewhere(lockName);
    changeController();
    await settle();
    expect(order).toEqual(['flush', 'lock', 'lock']);
    expect(ports.reload).not.toHaveBeenCalled();
    release();
    await settle();
    expect(order).toEqual(['flush', 'lock', 'lock', 'reload']);
    expect(ports.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads after the flush when signed out', async () => {
    const { changeController, order } = setup({ waiting: false, signedIn: false });
    changeController();
    await settle();
    expect(order).toEqual(['flush', 'reload']);
  });

  it('ignores controllerchange when it had no controller at load', async () => {
    const { changeController, ports } = setup({ waiting: false, controller: false });
    changeController();
    await settle();
    expect(ports.flushDrafts).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
  });
});
