// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const createCodeTheme = (options?: {
  padding?: string;
  fontSize?: string;
  lineHeight?: string;
}) => ({
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: '#0a0a10',
    margin: 0,
    padding: options?.padding ?? '12px 0',
    fontSize: options?.fontSize ?? '12px',
    lineHeight: options?.lineHeight ?? '1.5',
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: 'transparent',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  },
});

export const codeViewerTheme = createCodeTheme();
export const markdownCodeTheme = createCodeTheme({ padding: '16px 0', fontSize: '13px', lineHeight: '1.6' });

export const LINE_NUMBER_STYLE: React.CSSProperties = {
  minWidth: '3em',
  paddingRight: '1em',
  color: '#5a5a70',
  textAlign: 'right',
  userSelect: 'none',
};

export const highlightLineProps = (isHighlighted: boolean) => ({
  style: {
    display: 'block',
    backgroundColor: isHighlighted ? 'rgba(6, 182, 212, 0.14)' : 'transparent',
    borderLeft: isHighlighted ? '3px solid #06b6d4' : '3px solid transparent',
    paddingLeft: '12px',
    paddingRight: '16px',
  },
});
