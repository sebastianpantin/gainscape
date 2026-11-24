import { useQuery } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fitActivitiesOf } from '../../../lib/garmin/fit-file.ts';
import {
  FILE_READER_PROBLEM_TEXT,
  importStatusText,
  lastImportText,
  UNREADABLE_FILE_TEXT,
} from '../../../lib/garmin/import-review-rules.ts';
import { dropFinishedImport, heldFinishedImport, holdPendingImport } from '../../../lib/garmin/pending-import.ts';
import { garminLastImportQuery } from '../../../lib/query/queries.ts';
import { HISTORY_PATH } from '../../history/SessionHeader.tsx';

const GARMIN_IMPORT_PATH = '/profile/settings/garmin-import';

export function GarminSection({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [finished] = useState(heldFinishedImport);
  useEffect(() => dropFinishedImport, []);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { data: lastImportAt } = useQuery(garminLastImportQuery(userId));

  const openReview = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setProblem(null);
    setReading(true);
    const activities = await file
      .arrayBuffer()
      .then(fitActivitiesOf)
      .catch(() => null);
    setReading(false);
    if (activities === null) return setProblem(FILE_READER_PROBLEM_TEXT);
    if (activities.length === 0) return setProblem(UNREADABLE_FILE_TEXT);
    holdPendingImport({ fileName: file.name, activities });
    void navigate(GARMIN_IMPORT_PATH);
  };

  return (
    <section className="panel stack" aria-labelledby="garmin-heading">
      <h2 id="garmin-heading">Garmin</h2>
      {finished && (
        <p className="notice" role="status">
          {importStatusText(finished)}{' '}
          <Link className="tap-link" to={HISTORY_PATH}>
            See History
          </Link>
        </p>
      )}
      <button className="button" type="button" disabled={reading} onClick={() => fileInput.current?.click()}>
        {reading ? 'Reading file…' : 'Import from file'}
      </button>
      <input ref={fileInput} type="file" accept=".fit" hidden aria-label="Garmin activity file" onChange={openReview} />
      <span className="hint">
        In Garmin Connect on the web, open one activity and export it as a .fit file. You choose what to import before
        anything is saved.
      </span>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {lastImportAt && <span className="muted">{lastImportText(lastImportAt)}</span>}
    </section>
  );
}
