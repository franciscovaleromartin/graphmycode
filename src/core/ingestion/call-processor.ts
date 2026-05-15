// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { Query } from 'web-tree-sitter';
import { KnowledgeGraph } from '../graph/types';
import { ASTCache } from './ast-cache';
import { SymbolTable } from './symbol-table';
import { ImportMap } from './import-processor';
import { loadParser, loadLanguage } from '../tree-sitter/parser-loader';
import { LANGUAGE_QUERIES } from './tree-sitter-queries';
import { generateId } from '../../lib/utils';
import { getLanguageFromFilename } from './utils';
import { callRouters } from './call-routing';
import { extractLaravelRoutes } from './laravel-route-extractor';

/**
 * Node types that represent function/method definitions across languages.
 * Used to find the enclosing function for a call site.
 */
const FUNCTION_NODE_TYPES = new Set([
  // TypeScript/JavaScript
  'function_declaration',
  'arrow_function',
  'function_expression',
  'method_definition',
  'generator_function_declaration',
  // Python
  'function_definition',
  // Common async variants
  'async_function_declaration',
  'async_arrow_function',
  // Java
  'method_declaration',
  'constructor_declaration',
  // C/C++
  // 'function_definition' already included above
  // Go
  // 'method_declaration' already included from Java
  // C#
  'local_function_statement',
  // Rust
  'function_item',
  'impl_item', // Methods inside impl blocks
  // Ruby
  'method',           // def foo
  'singleton_method', // def self.foo
]);

/**
 * Walk up the AST from a node to find the enclosing function/method.
 * Returns null if the call is at module/file level (top-level code).
 */
const findEnclosingFunction = (
  node: any,
  filePath: string,
  symbolTable: SymbolTable
): string | null => {
  let current = node.parent;
  
  while (current) {
    if (FUNCTION_NODE_TYPES.has(current.type)) {
      // Found enclosing function - try to get its name
      let funcName: string | null = null;
      let label = 'Function';
      
      // Different node types have different name locations
      if (current.type === 'function_declaration' || 
          current.type === 'function_definition' ||
          current.type === 'async_function_declaration' ||
          current.type === 'generator_function_declaration' ||
          current.type === 'function_item') { // Rust function
        // Named function: function foo() {}
        const children = current.children;
        const nameNode = current.childForFieldName?.('name') ||
                         children?.find((c: any) => c.type === 'identifier' || c.type === 'property_identifier');
        funcName = nameNode?.text;
      } else if (current.type === 'impl_item') {
        // Rust method inside impl block: wrapper around function_item or const_item
        // We need to look inside for the function_item
        const children = current.children;
        const funcItem = children?.find((c: any) => c.type === 'function_item');
        if (funcItem) {
           const nameNode = funcItem.childForFieldName?.('name') ||
                            funcItem.children?.find((c: any) => c.type === 'identifier');
           funcName = nameNode?.text;
           label = 'Method';
        }
      } else if (current.type === 'method_definition') {
        // Method: foo() {} inside class (JS/TS)
        const children = current.children;
        const nameNode = current.childForFieldName?.('name') ||
                         children?.find((c: any) => c.type === 'property_identifier');
        funcName = nameNode?.text;
        label = 'Method';
      } else if (current.type === 'method_declaration') {
        // Java method: public void foo() {}
        const children = current.children;
        const nameNode = current.childForFieldName?.('name') ||
                         children?.find((c: any) => c.type === 'identifier');
        funcName = nameNode?.text;
        label = 'Method';
      } else if (current.type === 'constructor_declaration') {
        // Java constructor: public ClassName() {}
        const children = current.children;
        const nameNode = current.childForFieldName?.('name') ||
                         children?.find((c: any) => c.type === 'identifier');
        funcName = nameNode?.text;
        label = 'Method'; // Treat constructors as methods for process detection
      } else if (current.type === 'method') {
        // Ruby instance method: def foo
        const nameNode = current.childForFieldName?.('name') ||
                         current.children?.find((c: any) => c.type === 'identifier');
        funcName = nameNode?.text;
        label = 'Method';
      } else if (current.type === 'singleton_method') {
        // Ruby class method: def self.foo
        const nameNode = current.childForFieldName?.('name') ||
                         current.children?.find((c: any) => c.type === 'identifier');
        funcName = nameNode?.text;
        label = 'Method';
      } else if (current.type === 'arrow_function' || current.type === 'function_expression') {
        // Arrow/expression: const foo = () => {} - check parent variable declarator
        const parent = current.parent;
        if (parent?.type === 'variable_declarator') {
          const nameNode = parent.childForFieldName?.('name') ||
                           parent.children?.find((c: any) => c.type === 'identifier');
          funcName = nameNode?.text;
        }
      }
      
      if (funcName) {
        // Look up the function in symbol table to get its node ID
        // Try exact match first
        const nodeId = symbolTable.lookupExact(filePath, funcName);
        if (nodeId) return nodeId;
        
        // Try construct ID manually if lookup fails (common for non-exported internal functions)
        // Format should match what parsing-processor generates: "Function:path/to/file:funcName"
        // Check if we already have a node with this ID in the symbol table to be safe
        const generatedId = generateId(label, `${filePath}:${funcName}`);
        
        // Ideally we should verify this ID exists, but strictly speaking if we are inside it,
        // it SHOULD exist. Returning it is better than falling back to File.
        return generatedId;
      }
      
      // Couldn't determine function name - try parent (might be nested)
    }
    current = current.parent;
  }
  
  return null; // Top-level call (not inside any function)
};

/** AST node types that represent a class-like container */
const CLASS_CONTAINER_TYPES = new Set([
  'class_declaration', 'abstract_class_declaration',
  'interface_declaration', 'struct_declaration', 'record_declaration',
  'class_specifier', 'struct_specifier',
  'impl_item', 'trait_item',
  'class_definition',
  'trait_declaration',
  'protocol_declaration',
  'class', 'module', // Ruby
]);

const CONTAINER_TYPE_TO_LABEL: Record<string, string> = {
  class_declaration: 'Class', abstract_class_declaration: 'Class',
  interface_declaration: 'Interface',
  struct_declaration: 'Struct', struct_specifier: 'Struct',
  class_specifier: 'Class', class_definition: 'Class',
  impl_item: 'Impl', trait_item: 'Trait', trait_declaration: 'Trait',
  record_declaration: 'Record', protocol_declaration: 'Interface',
  class: 'Class', module: 'Module',
};

/** Walk up AST to find enclosing class/struct/interface, return its generateId or null. */
const findEnclosingClassId = (node: any, filePath: string): string | null => {
  let current = node.parent;
  while (current) {
    if (CLASS_CONTAINER_TYPES.has(current.type)) {
      const nameNode = current.childForFieldName?.('name')
        ?? current.children?.find((c: any) =>
          c.type === 'type_identifier' || c.type === 'identifier' || c.type === 'name' || c.type === 'constant'
        );
      if (nameNode) {
        const label = CONTAINER_TYPE_TO_LABEL[current.type] || 'Class';
        return generateId(label, `${filePath}:${nameNode.text}`);
      }
    }
    current = current.parent;
  }
  return null;
};

export const processCalls = async (
  graph: KnowledgeGraph,
  files: { path: string; content: string }[],
  astCache: ASTCache,
  symbolTable: SymbolTable,
  importMap: ImportMap,
  onProgress?: (current: number, total: number) => void
) => {
  const parser = await loadParser();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length);

    // 1. Check language support first
    const language = getLanguageFromFilename(file.path);
    if (!language) continue;

    const queryStr = LANGUAGE_QUERIES[language];
    if (!queryStr) continue;

    // 2. ALWAYS load the language before querying (parser is stateful)
    if (!await loadLanguage(language, file.path)) continue;

    // 3. Get AST (Try Cache First)
    let tree: import("web-tree-sitter").Tree | null | undefined = astCache.get(file.path);
    let wasReparsed = false;

    if (!tree) {
      // Cache Miss: Re-parse
      tree = parser.parse(file.content);
      wasReparsed = true;
    }
    if (!tree) continue;

    let query;
    let matches;
    try {
      query = new Query(parser.language!, queryStr);
      matches = query.matches(tree.rootNode);
    } catch (queryError) {
      console.warn(`Query error for ${file.path}:`, queryError);
      if (wasReparsed) tree.delete();
      continue;
    }

    const callRouter = callRouters[language];

    // 3. Process each call match
    matches.forEach((match: any) => {
      const captureMap: Record<string, any> = {};
      match.captures.forEach((c: any) => { captureMap[c.name] = c.node; });

      // Only process @call captures
      if (!captureMap['call']) return;

      const nameNode = captureMap['call.name'];
      if (!nameNode) return;

      const calledName = nameNode.text;

      // Dispatch: route language-specific calls (heritage, properties, imports)
      const routed = callRouter(calledName, captureMap['call']);
      if (routed) {
        switch (routed.kind) {
          case 'skip':
          case 'import': // handled by import-processor
            return;

          case 'heritage':
            for (const item of routed.items) {
              const childId = symbolTable.lookupExact(file.path, item.enclosingClass) ||
                              symbolTable.lookupFuzzy(item.enclosingClass)[0]?.nodeId ||
                              generateId('Class', `${file.path}:${item.enclosingClass}`);
              const parentId = symbolTable.lookupFuzzy(item.mixinName)[0]?.nodeId ||
                               generateId('Module', `${item.mixinName}`);
              if (childId && parentId) {
                const relId = generateId('IMPLEMENTS', `${childId}->${parentId}:${item.heritageKind}`);
                graph.addRelationship({
                  id: relId, sourceId: childId, targetId: parentId,
                  type: 'IMPLEMENTS', confidence: 1.0, reason: item.heritageKind,
                });
              }
            }
            return;

          case 'properties': {
            const fileId = generateId('File', file.path);
            const propEnclosingClassId = findEnclosingClassId(captureMap['call'], file.path);
            for (const item of routed.items) {
              const nodeId = generateId('Property', `${file.path}:${item.propName}`);
              graph.addNode({
                id: nodeId,
                label: 'Property' as any, // TODO: add 'Property' to graph node label union
                properties: {
                  name: item.propName, filePath: file.path,
                  startLine: item.startLine, endLine: item.endLine,
                  language, isExported: true,
                  description: item.accessorType,
                },
              });
              symbolTable.add(file.path, item.propName, nodeId, 'Property');
              const relId = generateId('DEFINES', `${fileId}->${nodeId}`);
              graph.addRelationship({
                id: relId, sourceId: fileId, targetId: nodeId,
                type: 'DEFINES', confidence: 1.0, reason: '',
              });
              if (propEnclosingClassId) {
                graph.addRelationship({
                  id: generateId('HAS_METHOD', `${propEnclosingClassId}->${nodeId}`),
                  sourceId: propEnclosingClassId, targetId: nodeId,
                  type: 'HAS_METHOD', confidence: 1.0, reason: '',
                });
              }
            }
            return;
          }

          case 'call':
            break; // fall through to normal call processing below
        }
      }

      // Skip common built-ins and noise
      if (isBuiltInOrNoise(calledName)) return;

      // 4. Resolve the target using priority strategy (returns confidence)
      const resolved = resolveCallTarget(
        calledName,
        file.path,
        symbolTable,
        importMap
      );

      if (!resolved) return;

      // 5. Find the enclosing function (caller)
      const callNode = captureMap['call'];
      const enclosingFuncId = findEnclosingFunction(callNode, file.path, symbolTable);

      // Use enclosing function as source, fallback to file for top-level calls
      const sourceId = enclosingFuncId || generateId('File', file.path);

      const relId = generateId('CALLS', `${sourceId}:${calledName}->${resolved.nodeId}`);

      graph.addRelationship({
        id: relId,
        sourceId,
        targetId: resolved.nodeId,
        type: 'CALLS',
        confidence: resolved.confidence,
        reason: resolved.reason,
      });
    });

    // Extract Laravel routes from route files via procedural AST walk
    if (language === 'php' && (file.path.includes('/routes/') || file.path.startsWith('routes/')) && file.path.endsWith('.php')) {
      const extractedRoutes = extractLaravelRoutes(tree, file.path);
      for (const route of extractedRoutes) {
        if (!route.controllerName || !route.methodName) continue;

        const controllerDefs = symbolTable.lookupFuzzy(route.controllerName);
        if (controllerDefs.length === 0) continue;

        const routeImportedFiles = importMap.get(route.filePath);
        let controllerDef = controllerDefs[0];
        let conf = controllerDefs.length === 1 ? 0.7 : 0.5;

        if (routeImportedFiles) {
          for (const def of controllerDefs) {
            if (routeImportedFiles.has(def.filePath)) {
              controllerDef = def;
              conf = 0.9;
              break;
            }
          }
        }

        const methodId = symbolTable.lookupExact(controllerDef.filePath, route.methodName);
        const routeSourceId = generateId('File', route.filePath);

        if (!methodId) {
          const guessedId = generateId('Method', `${controllerDef.filePath}:${route.methodName}`);
          const routeRelId = generateId('CALLS', `${routeSourceId}:route->${guessedId}`);
          graph.addRelationship({
            id: routeRelId,
            sourceId: routeSourceId,
            targetId: guessedId,
            type: 'CALLS',
            confidence: conf * 0.8,
            reason: 'laravel-route',
          });
          continue;
        }

        const routeRelId = generateId('CALLS', `${routeSourceId}:route->${methodId}`);
        graph.addRelationship({
          id: routeRelId,
          sourceId: routeSourceId,
          targetId: methodId,
          type: 'CALLS',
          confidence: conf,
          reason: 'laravel-route',
        });
      }
    }

    // Cleanup if re-parsed
    if (wasReparsed) {
      tree.delete();
    }
  }
};

/**
 * Resolution result with confidence scoring
 */
interface ResolveResult {
  nodeId: string;
  confidence: number;  // 0-1: how sure are we?
  reason: string;      // 'import-resolved' | 'same-file' | 'fuzzy-global'
}

/**
 * Resolve a function call to its target node ID using priority strategy:
 * A. Check imported files first (highest confidence)
 * B. Check local file definitions
 * C. Fuzzy global search (lowest confidence)
 * 
 * Returns confidence score so agents know what to trust.
 */
const resolveCallTarget = (
  calledName: string,
  currentFile: string,
  symbolTable: SymbolTable,
  importMap: ImportMap
): ResolveResult | null => {
  // Strategy A: Check imported files (HIGH confidence - we know the import chain)
  const importedFiles = importMap.get(currentFile);
  if (importedFiles) {
    for (const importedFile of importedFiles) {
      const nodeId = symbolTable.lookupExact(importedFile, calledName);
      if (nodeId) {
        return { nodeId, confidence: 0.9, reason: 'import-resolved' };
      }
    }
  }

  // Strategy B: Check local file (HIGH confidence - same file definition)
  const localNodeId = symbolTable.lookupExact(currentFile, calledName);
  if (localNodeId) {
    return { nodeId: localNodeId, confidence: 0.85, reason: 'same-file' };
  }

  // Strategy C: Fuzzy global search (LOW confidence - just matching by name)
  const fuzzyMatches = symbolTable.lookupFuzzy(calledName);
  if (fuzzyMatches.length > 0) {
    // Lower confidence if multiple matches exist (more ambiguous)
    const confidence = fuzzyMatches.length === 1 ? 0.5 : 0.3;
    return { nodeId: fuzzyMatches[0].nodeId, confidence, reason: 'fuzzy-global' };
  }

  return null;
};

/**
 * Filter out common built-in functions and noise
 * that shouldn't be tracked as calls
 */
/** Pre-built set (module-level singleton) to avoid re-creating per call */
const BUILT_IN_NAMES = new Set([
  // JavaScript/TypeScript built-ins
  'console', 'log', 'warn', 'error', 'info', 'debug',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'JSON', 'parse', 'stringify',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'resolve', 'reject', 'then', 'catch', 'finally',
  'Math', 'Date', 'RegExp', 'Error',
  'require', 'import', 'export',
  'fetch', 'Response', 'Request',
  // React hooks and common functions
  'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext',
  'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue',
  'createElement', 'createContext', 'createRef', 'forwardRef', 'memo', 'lazy',
  // Common array/object methods
  'map', 'filter', 'reduce', 'forEach', 'find', 'findIndex', 'some', 'every',
  'includes', 'indexOf', 'slice', 'splice', 'concat', 'join', 'split',
  'push', 'pop', 'shift', 'unshift', 'sort', 'reverse',
  'keys', 'values', 'entries', 'assign', 'freeze', 'seal',
  'hasOwnProperty', 'toString', 'valueOf',
  // Python built-ins
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple',
  'open', 'read', 'write', 'close', 'append', 'extend', 'update',
  'super', 'type', 'isinstance', 'issubclass', 'getattr', 'setattr', 'hasattr',
  'enumerate', 'zip', 'sorted', 'reversed', 'min', 'max', 'sum', 'abs',
  // C/C++ standard library and common kernel helpers
  'printf', 'fprintf', 'sprintf', 'snprintf', 'vprintf', 'vfprintf', 'vsprintf', 'vsnprintf',
  'scanf', 'fscanf', 'sscanf',
  'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memmove', 'memset', 'memcmp',
  'strlen', 'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp', 'strstr', 'strchr', 'strrchr',
  'atoi', 'atol', 'atof', 'strtol', 'strtoul', 'strtoll', 'strtoull', 'strtod',
  'sizeof', 'offsetof', 'typeof',
  'assert', 'abort', 'exit', '_exit',
  'fopen', 'fclose', 'fread', 'fwrite', 'fseek', 'ftell', 'rewind', 'fflush', 'fgets', 'fputs',
  // Linux kernel common macros/helpers (not real call targets)
  'likely', 'unlikely', 'BUG', 'BUG_ON', 'WARN', 'WARN_ON', 'WARN_ONCE',
  'IS_ERR', 'PTR_ERR', 'ERR_PTR', 'IS_ERR_OR_NULL',
  'ARRAY_SIZE', 'container_of', 'list_for_each_entry', 'list_for_each_entry_safe',
  'min', 'max', 'clamp', 'abs', 'swap',
  'pr_info', 'pr_warn', 'pr_err', 'pr_debug', 'pr_notice', 'pr_crit', 'pr_emerg',
  'printk', 'dev_info', 'dev_warn', 'dev_err', 'dev_dbg',
  'GFP_KERNEL', 'GFP_ATOMIC',
  'spin_lock', 'spin_unlock', 'spin_lock_irqsave', 'spin_unlock_irqrestore',
  'mutex_lock', 'mutex_unlock', 'mutex_init',
  'kfree', 'kmalloc', 'kzalloc', 'kcalloc', 'krealloc', 'kvmalloc', 'kvfree',
  'get', 'put',
  // Ruby built-ins and Kernel methods
  'puts', 'print', 'p', 'pp', 'warn', 'raise', 'fail',
  'require', 'require_relative', 'load', 'autoload',
  'include', 'extend', 'prepend',
  'attr_accessor', 'attr_reader', 'attr_writer',
  'public', 'private', 'protected', 'module_function',
  'lambda', 'proc', 'block_given?',
  'nil?', 'is_a?', 'kind_of?', 'instance_of?', 'respond_to?',
  'freeze', 'frozen?', 'dup', 'clone', 'tap', 'then', 'yield_self',
  // Ruby enumerables
  'each', 'map', 'select', 'reject', 'find', 'detect', 'collect',
  'inject', 'reduce', 'flat_map', 'each_with_object', 'each_with_index',
  'any?', 'all?', 'none?', 'count', 'first', 'last',
  'sort', 'sort_by', 'min', 'max', 'min_by', 'max_by',
  'group_by', 'partition', 'zip', 'compact', 'flatten', 'uniq',
]);

const isBuiltInOrNoise = (name: string): boolean => BUILT_IN_NAMES.has(name);

