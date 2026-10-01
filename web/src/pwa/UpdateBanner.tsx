import { useUpdateFlow, useUpdateState } from './register-service-worker.ts';

export function UpdateBanner() {
  const flow = useUpdateFlow();
  const state = useUpdateState();
  if (state === 'idle') return null;
  const apply = () => void flow?.apply();
  return (
    <div className="app-banner update-banner" role="status">
      {state === 'ready' && (
        <>
          <span>A new version of Gainscape is ready.</span>
          <button className="button primary" type="button" onClick={apply}>
            Reload
          </button>
        </>
      )}
      {(state === 'applying' || state === 'reloading') && <span>Updating Gainscape…</span>}
      {state === 'waiting_for_finish' && (
        <>
          <span>Saving your workout first…</span>
          <button className="button primary" type="button" disabled>
            Reload
          </button>
        </>
      )}
      {state === 'failed' && (
        <>
          <span>Couldn't update. Close other Gainscape tabs and try again.</span>
          <button className="button primary" type="button" onClick={apply}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
