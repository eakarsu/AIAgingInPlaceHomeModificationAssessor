export function readRecordList(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.records ?? payload?.data;
  if (!Array.isArray(rows)) throw new Error('The record service returned an invalid list. Retry after checking the database connection.');
  return rows;
}
