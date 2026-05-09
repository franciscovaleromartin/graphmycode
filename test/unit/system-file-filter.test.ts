import { describe, expect, it } from 'vitest';
import { isSystemFile } from '../../src/lib/system-file-filter';

describe('isSystemFile', () => {
  // ── macOS ──────────────────────────────────────────────────────────────
  it('detects __MACOSX/ prefix', () => {
    expect(isSystemFile('__MACOSX/project/src/main.py')).toBe(true);
  });
  it('detects __MACOSX/ in middle of path', () => {
    expect(isSystemFile('project/__MACOSX/src/file.py')).toBe(true);
  });
  it('detects standalone __MACOSX', () => {
    expect(isSystemFile('__MACOSX')).toBe(true);
  });
  it('detects .DS_Store', () => {
    expect(isSystemFile('src/.DS_Store')).toBe(true);
    expect(isSystemFile('.DS_Store')).toBe(true);
  });
  it('detects AppleDouble ._* files', () => {
    expect(isSystemFile('._agent.py')).toBe(true);
    expect(isSystemFile('src/._main.ts')).toBe(true);
  });
  it('detects .Spotlight-V100', () => {
    expect(isSystemFile('.Spotlight-V100/Store-V2/file')).toBe(true);
  });
  it('detects .Trashes', () => {
    expect(isSystemFile('.Trashes/501/file')).toBe(true);
  });
  it('detects .fseventsd', () => {
    expect(isSystemFile('.fseventsd/000000000012e678')).toBe(true);
  });

  // ── Windows ────────────────────────────────────────────────────────────
  it('detects Thumbs.db', () => {
    expect(isSystemFile('assets/Thumbs.db')).toBe(true);
  });
  it('detects ehthumbs.db', () => {
    expect(isSystemFile('ehthumbs.db')).toBe(true);
  });
  it('detects Desktop.ini', () => {
    expect(isSystemFile('Desktop.ini')).toBe(true);
    expect(isSystemFile('folder/Desktop.ini')).toBe(true);
  });
  it('detects $RECYCLE.BIN/', () => {
    expect(isSystemFile('$RECYCLE.BIN/file.txt')).toBe(true);
  });
  it('detects System Volume Information/', () => {
    expect(isSystemFile('System Volume Information/WPSettings.dat')).toBe(true);
  });

  // ── Linux ──────────────────────────────────────────────────────────────
  it('detects .Trash-1000/', () => {
    expect(isSystemFile('.Trash-1000/files/myfile')).toBe(true);
  });
  it('detects .directory', () => {
    expect(isSystemFile('folder/.directory')).toBe(true);
  });
  it('detects .nfs* lock files', () => {
    expect(isSystemFile('.nfs000000000123456')).toBe(true);
  });

  // ── Editors / IDEs ─────────────────────────────────────────────────────
  it('detects .idea/', () => {
    expect(isSystemFile('.idea/workspace.xml')).toBe(true);
    expect(isSystemFile('project/.idea/misc.xml')).toBe(true);
  });
  it('detects .vscode/', () => {
    expect(isSystemFile('.vscode/settings.json')).toBe(true);
  });
  it('detects .vs/', () => {
    expect(isSystemFile('.vs/Project/v17/Server.sqlite')).toBe(true);
  });
  it('detects *.suo files', () => {
    expect(isSystemFile('Project.suo')).toBe(true);
  });
  it('detects *.user files', () => {
    expect(isSystemFile('Project.csproj.user')).toBe(true);
  });

  // ── General temp / backup ──────────────────────────────────────────────
  it('detects *.tmp', () => {
    expect(isSystemFile('build/output.tmp')).toBe(true);
  });
  it('detects *.temp', () => {
    expect(isSystemFile('cache/data.temp')).toBe(true);
  });
  it('detects *.bak', () => {
    expect(isSystemFile('config.bak')).toBe(true);
  });
  it('detects *.swp (vim swap)', () => {
    expect(isSystemFile('.agent.py.swp')).toBe(true);
  });
  it('detects *.swo (vim swap)', () => {
    expect(isSystemFile('.agent.py.swo')).toBe(true);
  });
  it('detects *~ (editor backup)', () => {
    expect(isSystemFile('main.py~')).toBe(true);
  });

  // ── Legit files should NOT be filtered ─────────────────────────────────
  it('allows normal source files', () => {
    expect(isSystemFile('src/agent.py')).toBe(false);
    expect(isSystemFile('CLAUDE.md')).toBe(false);
    expect(isSystemFile('AGENTS.md')).toBe(false);
    expect(isSystemFile('.mcp.json')).toBe(false);
    expect(isSystemFile('src/components/App.tsx')).toBe(false);
  });
  it('allows empty string', () => {
    expect(isSystemFile('')).toBe(false);
  });
  it('allows Windows-style paths with backslashes for legit files', () => {
    expect(isSystemFile('src\\agent.py')).toBe(false);
  });
  it('handles Windows path for __MACOSX', () => {
    expect(isSystemFile('__MACOSX\\project\\file.py')).toBe(true);
  });
});
