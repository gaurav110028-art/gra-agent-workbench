'use client';

import { useState } from 'react';
import { previewLegacyStorage } from './legacy-preview.mjs';

const dispositions = {
  candidate: 'Supported by the import foundation',
  deferred: 'Preview only',
  excluded: 'Excluded from import',
};

export default function MigrationPreview() {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function inspect() {
    setBusy(true);
    setReport(null);
    setFailed(false);
    try {
      setReport(await previewLegacyStorage(window.localStorage, window.indexedDB));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace graMigration">
      <section className="settingsContainer">
        <header className="graMigrationHeading"><h1>Legacy data migration</h1></header>
        <p>Inspect records in this browser profile. The preview shows counts and validation results without uploading data.</p>
        <p role="status">This screen is preview-only. Importing real records requires a reviewed approval workflow and verified private storage.</p>
        <div className="graMigrationActions">
          <button type="button" className="loginBtn" disabled={busy} onClick={inspect}>
            {busy ? 'Inspecting…' : 'Preview this browser'}
          </button>
          <a className="graHeaderLink" href="/workspace">Return to workspace</a>
        </div>
        {failed && <p role="alert">Browser storage could not be inspected. The preview made no changes.</p>}
        {report && (
          <section aria-label="Browser inventory">
            <h2>Browser inventory</h2>
            {report.categories.every(row => !(row.valid || row.invalid || row.unreadable || row.excluded)) && <p>No known legacy records were found in this profile.</p>}
            {report.exceedsBatchLimits && <p role="alert">The candidate batch exceeds the current import limits. Review it before preparing an import.</p>}
            {report.categories.some(row => row.invalid || row.unreadable) && <p>Review invalid records and unreadable data before approving any future import.</p>}
            <div className="graTableScroll" tabIndex={0} role="region" aria-label="Browser inventory table"><table>
              <caption>Deferred categories receive a structural check. Unreadable counts refer to storage entries whose records could not be counted.</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Valid</th>
                  <th scope="col">Invalid</th>
                  <th scope="col">Unreadable</th>
                  <th scope="col">Excluded keys</th>
                  <th scope="col">Import status</th>
                </tr>
              </thead>
              <tbody>
                {report.categories.map(row => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    <td>{row.valid}</td>
                    <td>{row.invalid}</td>
                    <td>{row.unreadable}</td>
                    <td>{row.excluded}</td>
                    <td>{dispositions[row.disposition]}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        )}
      </section>
    </main>
  );
}
