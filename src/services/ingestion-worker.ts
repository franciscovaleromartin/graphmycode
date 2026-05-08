// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import * as Comlink from 'comlink';
import type { IngestionWorkerApi } from '../workers/ingestion.worker';

let workerInstance: Worker | null = null;
let workerApi: Comlink.Remote<IngestionWorkerApi> | null = null;

export function getWorkerApi(): Comlink.Remote<IngestionWorkerApi> {
  if (!workerApi) {
    workerInstance = new Worker(
      new URL('../workers/ingestion.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerApi = Comlink.wrap<IngestionWorkerApi>(workerInstance);
  }
  return workerApi;
}
