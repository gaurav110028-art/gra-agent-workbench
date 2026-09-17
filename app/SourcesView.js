'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  addAgentSources,
  clearAgentSources,
  deleteAgentSource,
  getAgentSources,
  getSourceFile,
  subscribeToSources,
} from './sourceStore';

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '-';

  return new Date(
    value
  ).toLocaleString();
}

function sourceIcon(category) {
  const icons = {
    PDF: 'PDF',
    Excel: 'XLS',
    CSV: 'CSV',
    Word: 'DOC',
    Image: 'IMG',
    Text: 'TXT',
    Other: 'FILE',
  };

  return icons[category] || 'FILE';
}

export default function SourcesView({
  agentId,
  agentName,
}) {
  const [sources, setSources] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [uploading, setUploading] =
    useState(false);

  const [dragging, setDragging] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [error, setError] =
    useState('');

  const fileInputRef = useRef(null);

  const loadSources = async () => {
    try {
      const next =
        await getAgentSources(
          agentId
        );

      setSources(next);
      setError('');
    } catch (loadError) {
      setError(
        loadError?.message ||
          'Could not load sources.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadSources();

    const unsubscribe =
      subscribeToSources(
        (detail) => {
          if (
            !detail?.agentId ||
            String(
              detail.agentId
            ) ===
              String(agentId)
          ) {
            loadSources();
          }
        }
      );

    return unsubscribe;
  }, [agentId]);

  const filteredSources =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return sources;
      }

      return sources.filter(
        (source) =>
          source.name
            .toLowerCase()
            .includes(query) ||
          source.category
            .toLowerCase()
            .includes(query)
      );
    }, [sources, search]);

  const uploadFiles = async (
    fileList
  ) => {
    const files = Array.from(
      fileList || []
    ).filter(Boolean);

    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setError('');

    try {
      await addAgentSources(
        agentId,
        files
      );

      await loadSources();
    } catch (uploadError) {
      setError(
        uploadError?.message ||
          'Could not save files.'
      );
    } finally {
      setUploading(false);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          '';
      }
    }
  };

  const openSource = async (
    source
  ) => {
    try {
      const file =
        await getSourceFile(
          agentId,
          source.id
        );

      if (!file) {
        throw new Error(
          'Source file is unavailable.'
        );
      }

      const url =
        URL.createObjectURL(
          file
        );

      window.open(
        url,
        '_blank',
        'noopener,noreferrer'
      );

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        60000
      );
    } catch (openError) {
      setError(
        openError?.message ||
          'Could not open file.'
      );
    }
  };

  const downloadSource =
    async (source) => {
      try {
        const file =
          await getSourceFile(
            agentId,
            source.id
          );

        if (!file) {
          throw new Error(
            'Source file is unavailable.'
          );
        }

        const url =
          URL.createObjectURL(
            file
          );

        const link =
          document.createElement(
            'a'
          );

        link.href = url;
        link.download =
          source.name;

        document.body.appendChild(
          link
        );

        link.click();
        link.remove();

        URL.revokeObjectURL(
          url
        );
      } catch (downloadError) {
        setError(
          downloadError?.message ||
            'Could not download file.'
        );
      }
    };

  const removeSource = async (
    source
  ) => {
    const confirmed =
      window.confirm(
        `Delete "${source.name}" from this agent's Sources?`
      );

    if (!confirmed) return;

    try {
      await deleteAgentSource(
        agentId,
        source.id
      );

      await loadSources();
    } catch (deleteError) {
      setError(
        deleteError?.message ||
          'Could not delete source.'
      );
    }
  };

  const clearAll = async () => {
    if (
      sources.length === 0
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        'Delete all Sources for this agent?'
      );

    if (!confirmed) return;

    try {
      await clearAgentSources(
        agentId
      );

      await loadSources();
    } catch (clearError) {
      setError(
        clearError?.message ||
          'Could not clear sources.'
      );
    }
  };

  return (
    <div className="sourcesPage">
      <div className="sourcesHeader">
        <div>
          <h2>Sources</h2>

          <p>
            Files available to{' '}
            <strong>
              {agentName ||
                'this agent'}
            </strong>
            . Upload once, then select
            them inside workflow blocks.
          </p>
        </div>

        <div className="sourcesHeaderActions">
          <button
            className="sourcesSecondaryButton"
            onClick={clearAll}
            disabled={
              sources.length === 0
            }
          >
            Clear All
          </button>

          <button
            className="sourcesUploadButton"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={uploading}
          >
            {uploading
              ? 'Uploading...'
              : '+ Upload Files'}
          </button>

          <input
            ref={fileInputRef}
            className="sourcesHiddenInput"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
            onChange={(event) =>
              uploadFiles(
                event.target.files
              )
            }
          />
        </div>
      </div>

      <div className="sourcesMvpNotice">
        <span>Local Source Library</span>

        <p>
          MVP storage is inside this
          browser using IndexedDB.
          Files are not sent to AI
          merely because they are
          uploaded here. A workflow
          must explicitly select a
          source before processing it.
        </p>
      </div>

      <div
        className={`sourcesDropZone ${
          dragging
            ? 'dragging'
            : ''
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();

          if (
            event.currentTarget ===
            event.target
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);

          uploadFiles(
            event.dataTransfer.files
          );
        }}
        onClick={() =>
          fileInputRef.current?.click()
        }
      >
        <div className="sourcesDropIcon">
          ↑
        </div>

        <strong>
          Drop client documents here
        </strong>

        <span>
          PDF, Excel, CSV, Word,
          images and text files
        </span>
      </div>

      <div className="sourcesToolbar">
        <div className="sourcesCount">
          <strong>
            {sources.length}
          </strong>{' '}
          source
          {sources.length === 1
            ? ''
            : 's'}
        </div>

        <input
          className="sourcesSearch"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Search sources..."
        />
      </div>

      {error && (
        <div className="sourcesError">
          {error}
        </div>
      )}

      {loading ? (
        <div className="sourcesEmpty">
          Loading sources...
        </div>
      ) : filteredSources.length ===
        0 ? (
        <div className="sourcesEmpty">
          <div className="sourcesEmptyIcon">
            □
          </div>

          <h3>
            {sources.length === 0
              ? 'No sources uploaded'
              : 'No matching sources'}
          </h3>

          <p>
            {sources.length === 0
              ? 'Upload the client documents that this agent should work with.'
              : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="sourcesList">
          <div className="sourcesListHeader">
            <span>File</span>
            <span>Type</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span>Status</span>
            <span />
          </div>

          {filteredSources.map(
            (source) => (
              <div
                className="sourceRow"
                key={source.id}
              >
                <div className="sourceFileCell">
                  <div
                    className={`sourceTypeIcon sourceType-${source.category.toLowerCase()}`}
                  >
                    {sourceIcon(
                      source.category
                    )}
                  </div>

                  <div>
                    <strong>
                      {source.name}
                    </strong>

                    <span>
                      {source.id}
                    </span>
                  </div>
                </div>

                <span>
                  {source.category}
                </span>

                <span>
                  {formatBytes(
                    source.size
                  )}
                </span>

                <span>
                  {formatDate(
                    source.uploadedAt
                  )}
                </span>

                <span className="sourceReadyPill">
                  <i />
                  Ready
                </span>

                <div className="sourceActions">
                  <button
                    onClick={() =>
                      openSource(source)
                    }
                  >
                    Open
                  </button>

                  <button
                    onClick={() =>
                      downloadSource(
                        source
                      )
                    }
                  >
                    Download
                  </button>

                  <button
                    className="sourceDeleteButton"
                    onClick={() =>
                      removeSource(
                        source
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
