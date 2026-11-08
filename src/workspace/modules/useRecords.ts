/** React binding for the on-device astronomy record store. */
import { useCallback, useEffect, useState } from 'react';
import {
  RECORDS_CHANGED_EVENT,
  deleteRecord,
  readRecords,
  recordsFor,
  saveRecord,
  type ModuleId,
  type ModuleRecord,
} from './records';

export interface RecordsApi {
  records: ModuleRecord[];
  /** False when the last write failed (storage blocked or full). */
  saved: boolean;
  save: (data: Record<string, string>, id?: string) => ModuleRecord;
  remove: (id: string) => void;
}

export function useRecords(moduleId: ModuleId): RecordsApi {
  const [records, setRecords] = useState<ModuleRecord[]>(() => recordsFor(moduleId));
  const [saved, setSaved] = useState(true);

  const reload = useCallback(() => {
    setRecords(recordsFor(moduleId, readRecords()));
  }, [moduleId]);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener(RECORDS_CHANGED_EVENT, onChange);
    // Another tab can write the same store; `storage` does not fire locally.
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(RECORDS_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [reload]);

  const save = useCallback(
    (data: Record<string, string>, id?: string) => {
      const result = saveRecord(moduleId, data, id ? { id } : {});
      setSaved(result.saved);
      setRecords(recordsFor(moduleId, readRecords()));
      return result.record;
    },
    [moduleId],
  );

  const remove = useCallback((id: string) => {
    setSaved(deleteRecord(id));
    setRecords(recordsFor(moduleId, readRecords()));
  }, [moduleId]);

  return { records, saved, save, remove };
}
