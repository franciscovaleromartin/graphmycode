// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * Returns true if the given path belongs to an OS/editor artifact that should
 * be ignored in any analysis or export (detection, context generation, etc.).
 *
 * Covers: macOS zip artifacts, Windows thumbnails, Linux trash dirs,
 * IDE metadata folders, and common temp/backup file extensions.
 */
export function isSystemFile(path: string): boolean {
  if (!path) return false;
  const p = path.replace(/\\/g, '/');
  const basename = p.split('/').pop() ?? '';

  // ── macOS ─────────────────────────────────────────────────────────────────
  if (p.includes('__MACOSX/') || p === '__MACOSX') return true;
  if (basename === '.DS_Store') return true;
  if (basename.startsWith('._')) return true;
  if (basename === '.Spotlight-V100' || p.includes('/.Spotlight-V100') || p.startsWith('.Spotlight-V100')) return true;
  if (basename === '.Trashes' || p.includes('/.Trashes') || p.startsWith('.Trashes')) return true;
  if (basename === '.fseventsd' || p.includes('/.fseventsd') || p.startsWith('.fseventsd')) return true;

  // ── Windows ───────────────────────────────────────────────────────────────
  if (basename === 'Thumbs.db' || basename === 'ehthumbs.db') return true;
  if (basename === 'Desktop.ini') return true;
  if (p.includes('$RECYCLE.BIN/') || basename === '$RECYCLE.BIN') return true;
  if (
    p.includes('System Volume Information/') ||
    basename === 'System Volume Information'
  ) return true;

  // ── Linux ─────────────────────────────────────────────────────────────────
  if (/\/\.Trash-/.test(p) || /^\.Trash-/.test(p)) return true;
  if (basename === '.directory') return true;
  if (basename.startsWith('.nfs')) return true;

  // ── Editors / IDEs ────────────────────────────────────────────────────────
  if (p.includes('/.idea/') || p.startsWith('.idea/')) return true;
  if (p.includes('/.vscode/') || p.startsWith('.vscode/')) return true;
  if (p.includes('/.vs/') || p.startsWith('.vs/')) return true;
  if (basename.endsWith('.suo') || basename.endsWith('.user')) return true;

  // ── General temp / backup ─────────────────────────────────────────────────
  if (basename.endsWith('.tmp') || basename.endsWith('.temp')) return true;
  if (basename.endsWith('.bak')) return true;
  if (basename.endsWith('.swp') || basename.endsWith('.swo')) return true;
  if (basename.endsWith('~')) return true;

  return false;
}
