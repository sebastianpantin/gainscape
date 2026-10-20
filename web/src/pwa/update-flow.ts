import { finishLockName } from '../offline/finish-lock.ts';
import { ACTIVATE_MESSAGE } from './shell-rules.ts';

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
export const ACTIVATE_TIMEOUT_MS = 10_000;
export const UPDATE_CHANNEL_NAME = 'gainscape-update';
export const RELOAD_PING = 'gainscape:reload';

export type UpdateState = 'idle' | 'ready' | 'applying' | 'waiting_for_finish' | 'reloading' | 'failed';

export type UpdateCheck = 'up_to_date' | 'download_failed' | 'ready';

export interface WorkerPort {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

interface RegistrationPort {
  waiting: WorkerPort | null;
  installing: WorkerPort | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

interface ContainerPort {
  controller: unknown;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

interface ChannelPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

export interface LocksPort {
  request<T>(name: string, callback: (lock: unknown) => Promise<T>): Promise<T>;
  request<T>(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<T>): Promise<T>;
}

export interface UpdatePorts {
  registration: RegistrationPort;
  serviceWorker: ContainerPort;
  locks: LocksPort | null;
  channel: ChannelPort | null;
  flushDrafts: () => Promise<void>;
  reload: () => void;
  now: () => number;
  userId: () => string | null;
  hadControllerAtLoad: boolean;
}

export interface UpdateFlow {
  state: () => UpdateState;
  subscribe: (listener: () => void) => () => void;
  apply: () => Promise<void>;
  checkForUpdates: () => Promise<UpdateCheck>;
  checkOnVisible: () => void;
}

const APPLYING_STATES: readonly UpdateState[] = ['applying', 'waiting_for_finish', 'reloading'];
const SETTLED_WORKER_STATES = ['installed', 'activating', 'activated', 'redundant'];

function settledState(worker: WorkerPort): Promise<string> {
  return new Promise((resolve) => {
    const check = () => {
      if (SETTLED_WORKER_STATES.includes(worker.state)) resolve(worker.state);
    };
    worker.addEventListener('statechange', check);
    check();
  });
}

function holdForever(): Promise<never> {
  return new Promise<never>(() => undefined);
}

export function createUpdateFlow(ports: UpdatePorts): UpdateFlow {
  const { registration, serviceWorker, locks, channel, flushDrafts, reload, now, userId, hadControllerAtLoad } = ports;
  const controllerAtLoad = serviceWorker.controller;
  const listeners = new Set<() => void>();
  let state: UpdateState = 'idle';
  let lastCheckAt = now();
  let passiveReloadStarted = false;
  let controllerChanged: (() => void) | null = null;

  const setState = (next: UpdateState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  const detect = () => {
    if (state === 'idle' && registration.waiting && serviceWorker.controller) setState('ready');
  };

  const reloadNow = (): Promise<never> => {
    setState('reloading');
    reload();
    return holdForever();
  };

  const withFinishLock = async (task: () => Promise<void>, onWait: () => void): Promise<void> => {
    const id = userId();
    if (!id || !locks) return task();
    const name = finishLockName(id);
    const acquired = await locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      await task();
      return true;
    });
    if (acquired) return;
    onWait();
    await locks.request(name, task);
  };

  const nextControllerChange = (): Promise<boolean> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        controllerChanged = null;
        resolve(false);
      }, ACTIVATE_TIMEOUT_MS);
      controllerChanged = () => {
        clearTimeout(timer);
        controllerChanged = null;
        resolve(true);
      };
    });

  const activateWaiting = async () => {
    await flushDrafts();
    const waiting = registration.waiting;
    if (!waiting) {
      if (serviceWorker.controller !== controllerAtLoad) return reloadNow();
      return setState('idle');
    }
    const changed = nextControllerChange();
    waiting.postMessage({ type: ACTIVATE_MESSAGE });
    if (await changed) {
      channel?.postMessage({ type: RELOAD_PING });
      return reloadNow();
    }
    setState('failed');
  };

  const apply = async () => {
    if (state !== 'ready' && state !== 'failed') return;
    setState('applying');
    try {
      await flushDrafts();
      await withFinishLock(activateWaiting, () => setState('waiting_for_finish'));
    } catch {
      setState('failed');
    }
  };

  const passiveReload = async () => {
    if (passiveReloadStarted) return;
    passiveReloadStarted = true;
    await flushDrafts();
    await withFinishLock(reloadNow, () => undefined);
  };

  serviceWorker.addEventListener('controllerchange', () => {
    if (controllerChanged) return controllerChanged();
    if (APPLYING_STATES.includes(state) || !hadControllerAtLoad) return;
    void passiveReload();
  });

  const watchInstalling = () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') detect();
    });
  };

  channel?.addEventListener('message', (event) => {
    if ((event.data as { type?: unknown } | null)?.type !== RELOAD_PING || APPLYING_STATES.includes(state)) return;
    void passiveReload();
  });

  registration.addEventListener('updatefound', watchInstalling);
  watchInstalling();
  detect();

  const checkForUpdates = async (): Promise<UpdateCheck> => {
    lastCheckAt = now();
    await registration.update();
    const installing = registration.installing;
    const outcome = installing ? await settledState(installing) : null;
    detect();
    if (registration.waiting && serviceWorker.controller) return 'ready';
    return outcome === 'redundant' ? 'download_failed' : 'up_to_date';
  };

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply,
    checkForUpdates,
    checkOnVisible: () => {
      if (now() - lastCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheckAt = now();
      void registration.update().then(detect, () => undefined);
    },
  };
}
