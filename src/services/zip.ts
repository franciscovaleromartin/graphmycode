// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { shouldIgnorePath } from '../config/ignore-service';

export interface FileEntry {
    path: string;
    content: string;
}

const findRootPrefix = (paths: string[]): string => {
    if (paths.length === 0) return '';
    const firstSegments = paths
        .filter(p => p.includes('/'))
        .map(p => p.split('/')[0]);
    if (firstSegments.length === 0) return '';
    const firstSegment = firstSegments[0];
    return firstSegments.every(s => s === firstSegment) ? firstSegment + '/' : '';
};

export const extractZip = async (file: File): Promise<FileEntry[]> => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const files: FileEntry[] = [];
    const allPaths: string[] = [];
    
    // First pass: collect all paths to find common root
    zip.forEach((relativePath: string, entry: any) => {
        if (!entry.dir) {
            allPaths.push(relativePath);
        }
    });
    
    // Find and strip root prefix (e.g., "repo-main/")
    const rootPrefix = findRootPrefix(allPaths);
    
    const promises: Promise<void>[] = [];

    const processEntry = async (relativePath: string, entry: { dir: boolean; async(type: 'string'): Promise<string> }) => {
        if (entry.dir) return;
        
        // Strip root prefix if present
        const normalizedPath = rootPrefix && relativePath.startsWith(rootPrefix)
            ? relativePath.slice(rootPrefix.length)
            : relativePath;
        
        if (!normalizedPath) return; // Skip if path becomes empty
        if (shouldIgnorePath(normalizedPath)) return;

        const content = await entry.async('string');
        
        files.push({
            path: normalizedPath,
            content: content
        });
    };

    zip.forEach((relativePath: string, entry: any) => {
        promises.push(processEntry(relativePath, entry));
    });
    
    await Promise.all(promises);
    
    return files;
};
