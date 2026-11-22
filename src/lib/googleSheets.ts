export interface SheetProductRow {
  id: string;
  rowIndex: number; // 0-based index in the Google Sheet
  name: string;
  image: string;
  description: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SheetMetadata {
  title: string;
  sheets: SheetTabInfo[];
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function extractGoogleDriveFileId(value: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/thumbnail\?.*id=([a-zA-Z0-9_-]+)/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const regex of patterns) {
    const match = value.match(regex);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function normalizeSheetImageUrl(rawValue: string): string {
  let value = rawValue.trim();
  if (!value) return '';

  const imageFormulaMatch = value.match(/^=\s*IMAGE\s*\(\s*["']([^"']+)["']/i);
  if (imageFormulaMatch?.[1]) {
    value = imageFormulaMatch[1].trim();
  } else {
    const hyperlinkFormulaMatch = value.match(/^=\s*HYPERLINK\s*\(\s*["']([^"']+)["']/i);
    if (hyperlinkFormulaMatch?.[1]) {
      value = hyperlinkFormulaMatch[1].trim();
    }
  }

  const driveId = extractGoogleDriveFileId(value);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`;
  }

  if (/^(https?:\/\/|\/)/i.test(value)) {
    return value;
  }

  return '';
}

function parseRowsToProducts(rows: unknown[][]): SheetProductRow[] {
  if (rows.length === 0) return [];

  const firstRow = rows[0].map((cell) => String(cell ?? '').trim().toLowerCase());

  const imageHeaderIdx = firstRow.findIndex(
    (h) =>
      /^(imagen|image|foto|photo|img|url|link)$/.test(h) ||
      h.includes('imagen') ||
      h.includes('foto') ||
      h.includes('image')
  );

  const nameHeaderIdx = firstRow.findIndex(
    (h) =>
      /^(nombre|titulo|título|name|producto|prenda)$/.test(h) ||
      h.includes('nombre') ||
      h.includes('producto') ||
      h.includes('prenda') ||
      h.includes('titulo') ||
      h.includes('título')
  );

  const descHeaderIdx = firstRow.findIndex(
    (h) =>
      /^(descripcion|descripción|description|detalle|detalles|texto)$/.test(h) ||
      h.includes('descrip') ||
      h.includes('detalle')
  );

  const hasHeaderRow = imageHeaderIdx !== -1 || nameHeaderIdx !== -1 || descHeaderIdx !== -1;
  const maxCols = rows.reduce((max, r) => (Array.isArray(r) ? Math.max(max, r.length) : max), 0);

  const imgCol = imageHeaderIdx !== -1 ? imageHeaderIdx : 0;
  let nameCol = nameHeaderIdx;
  let descCol = descHeaderIdx;

  if (nameCol === -1 && descCol === -1) {
    if (maxCols >= 3) {
      nameCol = imgCol === 1 ? 0 : 1;
      descCol = 2;
    } else {
      descCol = imgCol === 0 ? 1 : 0;
    }
  } else if (nameCol === -1) {
    if (maxCols >= 3) {
      const candidate = [0, 1, 2].find((idx) => idx !== imgCol && idx !== descCol);
      if (candidate !== undefined) nameCol = candidate;
    }
  } else if (descCol === -1) {
    const candidate = [0, 1, 2].find((idx) => idx !== imgCol && idx !== nameCol);
    if (candidate !== undefined) descCol = candidate;
  }

  const startRow = hasHeaderRow ? 1 : 0;
  const parsed: SheetProductRow[] = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const rawImg = String(row[imgCol] ?? '').trim();
    const rawName = nameCol !== -1 ? String(row[nameCol] ?? '').trim() : '';
    const rawDesc = descCol !== -1 ? String(row[descCol] ?? '').trim() : '';

    let resolvedImg = normalizeSheetImageUrl(rawImg);
    let resolvedName = rawName;
    let resolvedDesc = rawDesc;

    if (!resolvedImg) {
      for (let c = 0; c < row.length; c++) {
        const candidate = normalizeSheetImageUrl(String(row[c] ?? ''));
        if (candidate) {
          resolvedImg = candidate;
          const remaining = row
            .map((cell, idx) => (idx === c ? '' : String(cell ?? '').trim()))
            .filter(Boolean);
          if (!resolvedName && remaining.length >= 2) {
            resolvedName = remaining[0];
            resolvedDesc = remaining[1];
          } else if (!resolvedDesc && remaining.length >= 1) {
            resolvedDesc = remaining[0];
          }
          break;
        }
      }
    }

    if (!resolvedImg && !resolvedName && !resolvedDesc) continue;

    parsed.push({
      id: `sheet-row-${i + 1}`,
      rowIndex: i,
      name: resolvedName || `Prenda ${parsed.length + 1}`,
      image: resolvedImg,
      description: resolvedDesc || 'Disponible por mayor y menor. Envíos a todo el país.',
    });
  }

  return parsed;
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets.properties(sheetId,title)`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const message =
      errorBody?.error?.message ||
      `No se pudo acceder a la planilla (código ${res.status}).`;
    throw new Error(message);
  }

  const data = await res.json();
  const title: string = data?.properties?.title || 'Google Sheet';
  const sheets: SheetTabInfo[] = Array.isArray(data?.sheets)
    ? data.sheets
        .map((s: { properties?: { sheetId?: number; title?: string } }) => ({
          sheetId: Number(s?.properties?.sheetId ?? 0),
          title: String(s?.properties?.title ?? ''),
        }))
        .filter((s: SheetTabInfo) => s.title.length > 0)
    : [];

  return { title, sheets };
}

export async function fetchSheetProducts(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<SheetProductRow[]> {
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1:Z200`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const message =
      errorBody?.error?.message ||
      `No se pudieron leer las filas de "${sheetTitle}" (código ${res.status}).`;
    throw new Error(message);
  }

  const data = await res.json();
  const rows: unknown[][] = Array.isArray(data?.values) ? data.values : [];
  return parseRowsToProducts(rows);
}

export async function makeDriveFilePublicReadable(
  fileId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.error?.message || 'No se pudo habilitar la visibilidad pública del archivo.'
    );
  }
}

export async function createCatalogSpreadsheet(
  accessToken: string
): Promise<{ spreadsheetId: string; title: string; sheetTab: SheetTabInfo }> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: 'León Indumentaria — Catálogo Web',
      },
      sheets: [
        {
          properties: {
            title: 'Prendas',
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errorBody = await createRes.json().catch(() => null);
    throw new Error(
      errorBody?.error?.message || 'No se pudo crear la planilla en Google Sheets.'
    );
  }

  const created = await createRes.json();
  const spreadsheetId: string = created.spreadsheetId;
  const firstSheet = created.sheets?.[0]?.properties;
  const sheetTab: SheetTabInfo = {
    sheetId: Number(firstSheet?.sheetId ?? 0),
    title: String(firstSheet?.title ?? 'Prendas'),
  };

  // Write the 3 column headers: Imagen | Título | Descripción
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${sheetTab.title}'!A1:C1`)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [['Imagen', 'Título', 'Descripción']],
      }),
    }
  );

  // Make the newly created catalog spreadsheet readable by visitors opening the store link
  try {
    await makeDriveFilePublicReadable(spreadsheetId, accessToken);
  } catch {
    // Non-fatal if organization policies restrict anyone-with-link sharing
  }

  return {
    spreadsheetId,
    title: 'León Indumentaria — Catálogo Web',
    sheetTab,
  };
}

export async function uploadImageToDrive(
  file: File,
  accessToken: string
): Promise<string> {
  const metadata = {
    name: `leon_${Date.now()}_${file.name}`,
    mimeType: file.type || 'image/jpeg',
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!uploadRes.ok) {
    const errorBody = await uploadRes.json().catch(() => null);
    throw new Error(
      errorBody?.error?.message || 'No se pudo subir la imagen a Google Drive.'
    );
  }

  const uploaded = await uploadRes.json();
  const fileId: string = uploaded.id;
  if (!fileId) {
    throw new Error('Google Drive no devolvió el identificador de la imagen.');
  }

  await makeDriveFilePublicReadable(fileId, accessToken);
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
}

export async function appendSheetProduct(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  product: { image: string; name: string; description: string }
): Promise<void> {
  // Read first row to respect custom column order if headers exist
  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A1:C1`)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let rowValues = [product.image, product.name, product.description];

  if (headerRes.ok) {
    const headerData = await headerRes.json();
    const firstRow: string[] = Array.isArray(headerData?.values?.[0])
      ? headerData.values[0].map((v: unknown) => String(v ?? '').trim().toLowerCase())
      : [];

    if (firstRow.length === 0) {
      // Empty sheet: seed headers first
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A1:C1`)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [['Imagen', 'Título', 'Descripción']],
          }),
        }
      );
    } else {
      const imgIdx = firstRow.findIndex(
        (h) => h.includes('imagen') || h.includes('foto') || h.includes('image') || h === 'url'
      );
      const nameIdx = firstRow.findIndex(
        (h) => h.includes('nombre') || h.includes('titulo') || h.includes('título') || h.includes('producto')
      );
      const descIdx = firstRow.findIndex(
        (h) => h.includes('descrip') || h.includes('detalle')
      );

      if (imgIdx !== -1 && nameIdx !== -1 && descIdx !== -1) {
        const mapped = ['', '', ''];
        mapped[imgIdx] = product.image;
        mapped[nameIdx] = product.name;
        mapped[descIdx] = product.description;
        rowValues = mapped;
      }
    }
  }

  const range = `'${sheetTitle.replace(/'/g, "''")}'!A:C`;
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (!appendRes.ok) {
    const errorBody = await appendRes.json().catch(() => null);
    throw new Error(
      errorBody?.error?.message || 'No se pudo agregar la prenda a Google Sheets.'
    );
  }
}

export async function deleteSheetProductRow(
  spreadsheetId: string,
  sheetId: number,
  rowIndex: number,
  accessToken: string
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.error?.message || 'No se pudo eliminar la fila en Google Sheets.'
    );
  }
}

export async function fetchPublicSheetProducts(
  spreadsheetId: string,
  sheetTitle?: string
): Promise<SheetProductRow[]> {
  const sheetParam = sheetTitle ? `&sheet=${encodeURIComponent(sheetTitle)}` : '';
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId
  )}/gviz/tq?tqx=out:json${sheetParam}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('La planilla no está compartida como pública.');
  }

  const text = await res.text();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No se pudo leer la respuesta de la planilla pública.');
  }

  const payload = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  const cols: Array<{ label?: string }> = Array.isArray(payload?.table?.cols)
    ? payload.table.cols
    : [];
  const gvizRows: Array<{ c?: Array<{ v?: unknown; f?: unknown } | null> }> = Array.isArray(
    payload?.table?.rows
  )
    ? payload.table.rows
    : [];

  const headerLabels = cols.map((c) => c?.label || '');
  const hasColLabels = headerLabels.some((l) => l.trim().length > 0);

  const matrix: unknown[][] = [];
  if (hasColLabels) {
    matrix.push(headerLabels);
  }
  for (const r of gvizRows) {
    const cells = Array.isArray(r?.c)
      ? r.c.map((cell) => (cell?.v ?? cell?.f ?? ''))
      : [];
    matrix.push(cells);
  }

  return parseRowsToProducts(matrix);
}
