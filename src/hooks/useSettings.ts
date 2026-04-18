// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useAppState } from './useAppState';

export const useSettings = () => {
  const { llmSettings, updateLLMSettings } = useAppState();

  return {
    settings: llmSettings,
    updateSettings: updateLLMSettings,
  };
};
