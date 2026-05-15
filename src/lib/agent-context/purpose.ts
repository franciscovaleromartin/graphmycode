// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { GraphNode } from './types';

interface PurposeSignals {
  domain: string | undefined;
  components: string[];
  hasAuth: boolean;
}

const CHAT_DEP_RE = /flask.socketio|socket\.io|twilio|sendgrid|pusher/i;
const AUTH_PATTERN = /\b(auth|login|logout|signup|signin|permission|role|session|token|jwt|password|credential)\b/i;
const AUTH_DEP_RE = /flask.login|flask.security|authlib|python.jose|passlib|bcrypt|passport|next.auth|@auth\/|clerk|supabase.auth|lucia/i;

export function inferPurposeSignals(
  cleanNodes: GraphNode[],
  allDeps: Set<string> = new Set(),
): PurposeSignals | undefined {
  const symbols = cleanNodes.filter(
    (n) => n.label === 'Function' || n.label === 'Class' || n.label === 'Method',
  );
  if (symbols.length < 10) return undefined;

  const hits = (re: RegExp, min = 2): boolean => {
    let n = 0;
    for (const s of symbols) {
      if (re.test(s.properties.name ?? '') && ++n >= min) return true;
    }
    return false;
  };
  const depHas = (re: RegExp): boolean => [...allDeps].some((d) => re.test(d.toLowerCase()));

  let domain: string | undefined;
  const components: string[] = [];

  const hasPinecone = hits(/pinecone/i, 1) || depHas(/pinecone/);
  const hasWeaviate = hits(/weaviate/i, 1) || depHas(/weaviate/);
  const hasChroma   = hits(/\bchroma\b/i, 1) || depHas(/chroma/);
  const hasQdrant   = hits(/qdrant/i, 1) || depHas(/qdrant/);

  if (hasPinecone) components.push('Pinecone vector search');
  if (hasWeaviate) components.push('Weaviate vector search');
  if (hasChroma)   components.push('Chroma vector store');
  if (hasQdrant)   components.push('Qdrant vector search');

  {
    const hasMemorySignal = hits(/\b(memory|recall|remember|forget|retention|memorize)\b/i, 1);
    if (hasMemorySignal) {
      domain = 'agent memory system';
      const hasMCP = depHas(/mcp|modelcontextprotocol|fastmcp/) || hits(/\bmcp\b/i, 1);
      const hasEmbedding = depHas(/embed|sentence.?transform|fastembed/) || hits(/\bembed/i, 1);
      if (hasMCP) components.push('MCP support');
      if (hasEmbedding) components.push('embedding support');
    }
  }

  if (!domain) {
    const hasRAGNames = hits(/\b(rag|retriev|embed|chunk|ingest)\b/i, 2);
    if (hasRAGNames || hasPinecone || hasWeaviate || hasChroma || hasQdrant) domain = 'RAG';
  }

  if (hits(/elevenlabs|tts|\bspeech\b|audio_gen/i, 1) || depHas(/elevenlabs/)) {
    components.push('ElevenLabs audio generation');
  }

  if (hits(/\b(stripe|payment|checkout|billing|subscription)\b/i, 2) || depHas(/stripe/)) {
    components.push('Stripe payments');
  }

  if (!domain) {
    const hasGraphSignal = hits(
      /\b(cluster|community|node_map|edge_data|graph|adjacen|degree|centrality|dedup|connect|entit|similar)\b/i,
      2,
    );
    const hasCodeSignal = hits(
      /\b(parse|ast|callflow|call_flow|tree_sitter|syntax|token|grammar|visitor|walker)\b/i,
      1,
    );
    const hasBuildSignal = hits(
      /\b(build_from|generate|export|to_html|to_wiki|render|serialize)\b/i,
      1,
    );

    if      (hasGraphSignal && hasCodeSignal) domain = 'code knowledge graph';
    else if (hasGraphSignal && hasBuildSignal) domain = 'knowledge graph builder';
    else if (hasGraphSignal)                  domain = 'knowledge graph';
    else if (hasCodeSignal && hasBuildSignal) domain = 'code analysis and generation';
    else if (hasCodeSignal)                   domain = 'code analysis';
  }

  if (!domain) {
    const hasAI =
      hits(/\b(openai|anthropic|claude|gpt|llm|completion|generate_text)\b/i, 2)
      || depHas(/openai|anthropic|groq|mistral|cohere/);
    if (hasAI) domain = 'AI';
  }

  if (!domain) {
    if      (hits(/galler|photo|album|thumbnail|carousel/i, 3))               domain = 'photo gallery';
    else if (hits(/ecomm|product|cart|order|inventory|shop|catalog/i, 3))     domain = 'e-commerce';
    else if (hits(/blog|post|article|publish|comment|markdown/i, 3))          domain = 'content management';
    else if (hits(/task|todo|sprint|kanban|board|ticket/i, 3))                domain = 'project management';
    else if (hits(/dashboard|metric|analytic|report|chart|stat|kpi/i, 3))     domain = 'analytics dashboard';
    else if (hits(/map|location|geo|marker|route|coordinate/i, 3))            domain = 'mapping';
    else if (hits(/video|stream|player|playlist|episode/i, 3))                domain = 'video streaming';
    else if (depHas(CHAT_DEP_RE) && hits(/\b(chat|message|inbox|thread|conversation|dm)\b/i, 3))
      domain = 'chat';
  }

  const authDep = [...allDeps].some((d) => AUTH_DEP_RE.test(d.toLowerCase()));
  const authNameCount = symbols.filter((n) => AUTH_PATTERN.test(n.properties.name ?? '')).length;
  const hasAuth = authDep || authNameCount >= 3;

  if (!domain && components.length === 0 && !hasAuth) return undefined;
  return { domain, components, hasAuth };
}
