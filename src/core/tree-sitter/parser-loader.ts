// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { Parser, Language as ParserLanguage } from 'web-tree-sitter';
import { SupportedLanguages } from '../../config/supported-languages';

type ParserInstance = InstanceType<typeof Parser>;

let parser: ParserInstance | null = null;

// Cache the compiled Language objects to avoid fetching/compiling twice
const languageCache = new Map<string, ParserLanguage>();
// Track grammars that failed to load (wrong dylink ABI) so we don't retry on every file
const failedWasmPaths = new Set<string>();

export const loadParser = async (): Promise<ParserInstance> => {
    if (parser) return parser;

    await Parser.init({
        locateFile: (scriptName: string) => {
            return `/wasm/${scriptName}`;
        }
    });

    parser = new Parser();
    return parser;
}

// Get the appropriate WASM file based on language and file extension
const getWasmPath = (language: SupportedLanguages, filePath?: string): string => {
    // For TypeScript, check if it's a TSX file
    if (language === SupportedLanguages.TypeScript) {
        if (filePath?.endsWith('.tsx')) {
            return '/wasm/typescript/tree-sitter-tsx.wasm';
        }
        return '/wasm/typescript/tree-sitter-typescript.wasm';
    }
    
    const languageFileMap: Record<SupportedLanguages, string> = {
        [SupportedLanguages.JavaScript]: '/wasm/javascript/tree-sitter-javascript.wasm',
        [SupportedLanguages.TypeScript]: '/wasm/typescript/tree-sitter-typescript.wasm',
        [SupportedLanguages.Python]: '/wasm/python/tree-sitter-python.wasm',
        [SupportedLanguages.Java]: '/wasm/java/tree-sitter-java.wasm',
        [SupportedLanguages.C]: '/wasm/c/tree-sitter-c.wasm',
        [SupportedLanguages.CPlusPlus]: '/wasm/cpp/tree-sitter-cpp.wasm',
        [SupportedLanguages.CSharp]: '/wasm/csharp/tree-sitter-csharp.wasm',
        [SupportedLanguages.Go]: '/wasm/go/tree-sitter-go.wasm',
        [SupportedLanguages.Rust]: '/wasm/rust/tree-sitter-rust.wasm',
        [SupportedLanguages.PHP]: '/wasm/php/tree-sitter-php.wasm',
        [SupportedLanguages.Ruby]: '/wasm/ruby/tree-sitter-ruby.wasm',
        [SupportedLanguages.Kotlin]: '', // Kotlin WASM parser not yet available for web
        [SupportedLanguages.Swift]: '/wasm/swift/tree-sitter-swift.wasm',
        [SupportedLanguages.Dart]: '/wasm/dart/tree-sitter-dart.wasm',
    };
    
    return languageFileMap[language];
};

// Returns true if the language was loaded successfully, false if the grammar is
// unavailable (wrong ABI / missing file). Callers should skip the file on false.
export const loadLanguage = async (language: SupportedLanguages, filePath?: string): Promise<boolean> => {
    if (!parser) await loadParser();
    const wasmPath = getWasmPath(language, filePath);

    if (!wasmPath) {
        return false;
    }

    if (failedWasmPaths.has(wasmPath)) {
        return false;
    }

    if (languageCache.has(wasmPath)) {
        parser!.setLanguage(languageCache.get(wasmPath)!);
        return true;
    }

    try {
        const loadedLanguage = await ParserLanguage.load(wasmPath);
        languageCache.set(wasmPath, loadedLanguage);
        parser!.setLanguage(loadedLanguage);
        return true;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ [Parser] Grammar unavailable for ${language} (${errorMessage}) — skipping ${language} files`);
        failedWasmPaths.add(wasmPath);
        return false;
    }
}
