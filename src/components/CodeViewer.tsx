// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { codeViewerTheme, LINE_NUMBER_STYLE, highlightLineProps } from '../lib/syntax-theme';

interface CodeViewerProps {
  content: string;
  language: string;
  startingLineNumber?: number;
  highlightRange?: { start: number; end: number };
}

export const CodeViewer = ({
  content,
  language,
  startingLineNumber = 1,
  highlightRange,
}: CodeViewerProps) => (
  <SyntaxHighlighter
    language={language}
    style={codeViewerTheme as any}
    showLineNumbers
    startingLineNumber={startingLineNumber}
    lineNumberStyle={LINE_NUMBER_STYLE}
    lineProps={(lineNumber) =>
      highlightLineProps(
        !!highlightRange &&
          lineNumber >= highlightRange.start &&
          lineNumber <= highlightRange.end,
      )
    }
    wrapLines
  >
    {content}
  </SyntaxHighlighter>
);
