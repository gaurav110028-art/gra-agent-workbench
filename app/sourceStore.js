const DB_NAME = 'gra-agent-workbench';
const DB_VERSION = 1;
const STORE_NAME = 'sources';
const SOURCES_EVENT = 'gra-sources-updated';

function canUseIndexedDb() {
  return (
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined'
  );
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(
        new Error(
          'IndexedDB is not available in this browser.'
        )
      );
      return;
    }

    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      let store;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(
          STORE_NAME,
          {
            keyPath: 'id',
          }
        );
      } else {
        store =
          request.transaction.objectStore(
            STORE_NAME
          );
      }

      if (
        !store.indexNames.contains('agentId')
      ) {
        store.createIndex(
          'agentId',
          'agentId',
          {
            unique: false,
          }
        );
      }

      if (
        !store.indexNames.contains('uploadedAt')
      ) {
        store.createIndex(
          'uploadedAt',
          'uploadedAt',
          {
            unique: false,
          }
        );
      }
    };

    request.onsuccess = () =>
      resolve(request.result);

    request.onerror = () =>
      reject(
        request.error ||
          new Error(
            'Could not open source storage.'
          )
      );
  });
}

function classifySource(file) {
  const name = String(
    file?.name || ''
  ).toLowerCase();

  const type = String(
    file?.type || ''
  ).toLowerCase();

  if (
    type === 'application/pdf' ||
    name.endsWith('.pdf')
  ) {
    return 'PDF';
  }

  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    type.includes('spreadsheet') ||
    type.includes('excel')
  ) {
    return 'Excel';
  }

  if (
    name.endsWith('.csv') ||
    type === 'text/csv'
  ) {
    return 'CSV';
  }

  if (
    name.endsWith('.docx') ||
    name.endsWith('.doc') ||
    type.includes('word')
  ) {
    return 'Word';
  }

  if (
    type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(
      name
    )
  ) {
    return 'Image';
  }

  if (
    name.endsWith('.txt') ||
    type.startsWith('text/')
  ) {
    return 'Text';
  }

  return 'Other';
}

function emitSourcesUpdated(agentId) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(SOURCES_EVENT, {
      detail: {
        agentId: String(agentId),
      },
    })
  );
}

export async function addAgentSources(
  agentId,
  files
) {
  const db = await openDatabase();

  const cleanFiles = Array.from(
    files || []
  ).filter(Boolean);

  if (cleanFiles.length === 0) {
    db.close();
    return [];
  }

  const records = cleanFiles.map(
    (file, index) => ({
      id: `source-${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

      agentId: String(agentId),

      name: file.name,
      mimeType:
        file.type ||
        'application/octet-stream',

      size: file.size || 0,

      lastModified:
        file.lastModified || Date.now(),

      category: classifySource(file),

      uploadedAt:
        new Date().toISOString(),

      status: 'Ready',

      file,
    })
  );

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readwrite'
    );

    const store =
      transaction.objectStore(
        STORE_NAME
      );

    records.forEach((record) => {
      store.put(record);
    });

    transaction.oncomplete = () =>
      resolve();

    transaction.onerror = () =>
      reject(
        transaction.error ||
          new Error(
            'Could not save source files.'
          )
      );
  });

  db.close();

  emitSourcesUpdated(agentId);

  return records.map(
    ({ file, ...metadata }) =>
      metadata
  );
}

export async function getAgentSources(
  agentId
) {
  const db = await openDatabase();

  const records = await new Promise(
    (resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        'readonly'
      );

      const store =
        transaction.objectStore(
          STORE_NAME
        );

      const index =
        store.index('agentId');

      const request =
        index.getAll(
          String(agentId)
        );

      request.onsuccess = () =>
        resolve(
          request.result || []
        );

      request.onerror = () =>
        reject(
          request.error ||
            new Error(
              'Could not load sources.'
            )
        );
    }
  );

  db.close();

  return records
    .map(({ file, ...metadata }) => ({
      ...metadata,
    }))
    .sort(
      (a, b) =>
        new Date(b.uploadedAt) -
        new Date(a.uploadedAt)
    );
}

export async function getSourceRecord(
  agentId,
  sourceId
) {
  if (!sourceId) return null;

  const db = await openDatabase();

  const record = await new Promise(
    (resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        'readonly'
      );

      const request =
        transaction
          .objectStore(STORE_NAME)
          .get(sourceId);

      request.onsuccess = () =>
        resolve(
          request.result || null
        );

      request.onerror = () =>
        reject(
          request.error ||
            new Error(
              'Could not load source.'
            )
        );
    }
  );

  db.close();

  if (
    record &&
    record.agentId !==
      String(agentId)
  ) {
    return null;
  }

  return record;
}

export async function getSourceFile(
  agentId,
  sourceId
) {
  const record =
    await getSourceRecord(
      agentId,
      sourceId
    );

  if (!record?.file) {
    return null;
  }

  if (record.file instanceof File) {
    return record.file;
  }

  return new File(
    [record.file],
    record.name,
    {
      type:
        record.mimeType ||
        record.file.type ||
        'application/octet-stream',

      lastModified:
        record.lastModified ||
        Date.now(),
    }
  );
}

export async function deleteAgentSource(
  agentId,
  sourceId
) {
  const record =
    await getSourceRecord(
      agentId,
      sourceId
    );

  if (!record) return;

  const db = await openDatabase();

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      'readwrite'
    );

    transaction
      .objectStore(STORE_NAME)
      .delete(sourceId);

    transaction.oncomplete = () =>
      resolve();

    transaction.onerror = () =>
      reject(
        transaction.error ||
          new Error(
            'Could not delete source.'
          )
      );
  });

  db.close();

  emitSourcesUpdated(agentId);
}

export async function clearAgentSources(
  agentId
) {
  const db = await openDatabase();

  const ids = await new Promise(
    (resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        'readonly'
      );

      const request =
        transaction
          .objectStore(STORE_NAME)
          .index('agentId')
          .getAllKeys(
            String(agentId)
          );

      request.onsuccess = () =>
        resolve(
          request.result || []
        );

      request.onerror = () =>
        reject(
          request.error ||
            new Error(
              'Could not load source IDs.'
            )
        );
    }
  );

  if (ids.length > 0) {
    await new Promise(
      (resolve, reject) => {
        const transaction =
          db.transaction(
            STORE_NAME,
            'readwrite'
          );

        const store =
          transaction.objectStore(
            STORE_NAME
          );

        ids.forEach((id) =>
          store.delete(id)
        );

        transaction.oncomplete = () =>
          resolve();

        transaction.onerror = () =>
          reject(
            transaction.error ||
              new Error(
                'Could not clear sources.'
              )
          );
      }
    );
  }

  db.close();

  emitSourcesUpdated(agentId);
}

export function subscribeToSources(
  callback
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) =>
    callback(event?.detail);

  window.addEventListener(
    SOURCES_EVENT,
    handler
  );

  return () => {
    window.removeEventListener(
      SOURCES_EVENT,
      handler
    );
  };
}
