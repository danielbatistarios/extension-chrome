# SEO Analyzer — Extensão Chrome (Maturare)

**Versão:** 1.9.0 | **Manifest:** V3 | **Desenvolvedor:** Maturare Agência SEO/GEO/AEO

Extensão Chrome profissional para análise SEO on-page completa, monitoramento de AI Overview, e diagnóstico semântico de chunks para GEO/AEO. Construída internamente pela [Maturare](https://maturare.com.br).

---

## Instalação (modo desenvolvedor)

1. Abrir `chrome://extensions/`
2. Ativar **Modo do desenvolvedor** (toggle superior direito)
3. Clicar em **Carregar sem compactação**
4. Selecionar a pasta raiz deste repositório
5. A extensão aparece na barra de ferramentas do Chrome

---

## Estrutura de arquivos

```
seo-extension/
│
├── manifest.json              # Configuração MV3 — permissões, content scripts, side panel
├── background.js              # Service Worker — roteador de mensagens, cache de headers, badge dinâmico
│
├── popup.html                 # Interface principal (side panel) — 13 abas
├── popup.js                   # Lógica principal — ~10.000 linhas — todos os renders e orquestradores de API
├── popup.css                  # Estilos — tema dark/light/paper, todos os componentes
│
├── content_analyzer.js        # Engine de análise de página — injetado via scripting API
├── img_collector.js           # Coleta de imagens em 9 camadas (content script, document_start)
├── aio_monitor.js             # Monitor de AI Overview do Google (content script, Google Search)
├── paa_extractor.js           # Extrator de "Pessoas Também Perguntam" (content script)
├── sc_extractor.js            # Extrator de queries do Search Console (content script)
├── index_extractor.js         # Extrator de indexação via site: (content script)
│
├── graph_fullscreen.html/js   # Visualizador de grafo de schema (D3.js, fullscreen)
├── links_fullscreen.html/js   # Mapa de links com link juice (D3.js, fullscreen)
├── crawl_fullscreen.html/js   # Crawler BFS multi-nível (fullscreen)
├── paa_mindmap.html/js        # Mindmap de PAA (D3.js, fullscreen)
├── aio_dashboard.html/js      # Dashboard quadrante AIO (fullscreen)
│
├── src/
│   ├── content.js             # Content script auxiliar (paste to page, seleção de texto)
│   └── d3.v7.min.js           # D3.js v7 — visualizações de grafo
│
└── icons/                     # Ícones da extensão (16, 48, 128px) + logos Maturare
```

---

## Abas da interface

### 1. 360° — Diagnóstico Completo
Painel de status rápido de todas as 13 categorias. Score geral animado com anel SVG (A+ a F). Cada categoria tem status pass/warn/fail e link direto para a aba correspondente.

### 2. Overview
Resumo da página: title, meta description, H1, word count, canonical, robots, OG tags, hreflang. Score de saúde on-page com badge colorido na extensão.

### 3. Headings
Análise da hierarquia H1-H6:
- Score de estrutura (12 critérios: salto de nível, H1 único, H2 como pergunta, etc.)
- **Painel de Entity Salience**: chama Google NL API com o texto dos headings, mostra quais entidades estão sendo sinalizadas e com que força
- **Botão "Analisar com IA"**: monta prompt com a estrutura atual + dados NL API e abre Claude/ChatGPT/Gemini/Perplexity para sugestão de melhoria

### 4. Links
Análise de links internos e externos:
- Classificação de anchor text: Phrase Match (verde), Exact Match (teal), Branded (roxo), Ruim (vermelho)
- Visualizador de link juice em grafo D3.js (fullscreen)
- **Botão "Analisar com IA"**: envia diagnóstico completo para IA

### 5. Images
Análise de imagens em 9 camadas:
- Alt text, formato (WebP/AVIF/JPG), dimensões, lazy loading, above-the-fold
- Headers HTTP reais (content-length, content-type) via background service worker
- Detecção de imagens oversized

### 6. Schema
Análise de dados estruturados JSON-LD:
- Parsing e validação de todos os blocos `<script type="application/ld+json">`
- Erros P0/P1 com sugestões de correção
- Visualizador de grafo interativo (D3.js) — nós por @type, links por referência
- Links diretos para Google Rich Results Tester e Schema.org Validator
- Gerador de schema por tipo (Article, LocalBusiness, Product, etc.)

### 7. Checks
16 categorias de análise automática:
1. Structured Data & Schema
2. Semantic HTML
3. Accessibility for Agents
4. Internal Linking
5. Meta & Discoverability
6. Machine Readability
7. Entity & Authority
8. Citability & Answer-Readiness
9. Performance & Crawlability
10. Agent Interactivity
11. Content Positioning
12. Content Freshness
13. Information Density
14. Factual Verifiability
15. Content Comprehensiveness
16. Multimodal Content

### 8. Graph
Visualizador fullscreen do Knowledge Graph da página em D3.js force-directed. Nós coloridos por @type, arestas por relação entre entidades.

### 9. Speed
Core Web Vitals via PageSpeed Insights API:
- LCP, CLS, FID/INP, FCP, TTFB
- Score mobile e desktop
- Oportunidades de melhoria com impacto estimado

### 10. Semantic
Análise de HTML semântico:
- Presença e uso correto de `<main>`, `<article>`, `<section>`, `<aside>`, `<header>`, `<footer>`, etc.
- Detecção de div-abuse
- Comparação visual: estrutura ideal vs. estrutura atual da página
- Perfis por tipo de página (blog, home, listing, product)

### 11. **Chunks AEO** ← Nova aba (implementada nesta sessão)
Análise semântica profunda do conteúdo por chunk. Ver seção completa abaixo.

### 12. Index
Verificação de indexação no Google via operador `site:`.

### 13. Config
- Chaves de API (OpenAI, Anthropic, Gemini, Perplexity, NVIDIA NIM, PageSpeed)
- Ativar/desativar PAA Extractor e AI Overview Monitor
- Seletor de modelo NVIDIA NIM (28 modelos disponíveis)
- Chat com IA sobre a página atual (contexto da página injetado automaticamente)

---

## Aba Chunks AEO — Documentação Detalhada

Esta é a funcionalidade central desta versão. Analisa o conteúdo da página dividido em chunks semânticos, usando duas APIs em paralelo para diagnóstico profundo de GEO/AEO.

### Por que chunks?

Modelos de linguagem (ChatGPT, Perplexity, Gemini) citam conteúdo por **seções auto-suficientes**, não por páginas inteiras. Cada chunk precisa ter:
1. Um fato ou definição na primeira frase
2. Um dado numérico específico no corpo
3. Uma conclusão acionável na última frase

Se um chunk não tem os 3 elementos, a probabilidade de ser citado por IA cai drasticamente (Kyle Byers, InLinks research).

### Pipeline de análise

```
Página carregada
      │
      ▼
content_analyzer.js → analyzeChunks()
  TreeWalker percorre DOM em ordem de documento
  Agrupa: cada H2/H3 abre novo chunk + parágrafos seguintes
  Fallback: agrupa <p> em blocos 150-300 palavras
  Análise local imediata: ARI, 3-element heurístico, S-P-O verbos
      │
      ▼
popup.js → renderChunks()
  Para cada chunk (máx 8 via API):
  ┌─────────────────────────────────────┐
  │ Google NL API (annotateText)        │  ~200ms
  │   → entidades + salience + tipo     │
  │   → dependency parsing (S-P-O real) │
  └────────────────┬────────────────────┘
                   │ Promise.all (paralelo)
  ┌────────────────▼────────────────────┐
  │ NVIDIA NIM (Llama 4 Maverick)       │  ~2-3s
  │   → hasFact / hasNumber /           │
  │     hasConclusion                   │
  │   → intentLayer (8 camadas)         │
  │   → EAV triples extraídas           │
  │   → ARI Score + AEO Score           │
  └─────────────────────────────────────┘
      │
      ▼
  calcChunkScore()
  SCORE = entity_salience×0.30
        + chunk_completeness×0.25
        + spo_coverage×0.20
        + 3element_llm×0.15
        + data_chunk_presence×0.10
      │
      ▼
  Score GEO/AEO geral + Painel de 5 experts + Cards colapsáveis
```

### Extração de chunks (content_analyzer.js → analyzeChunks)

**Algoritmo TreeWalker:**
- Percorre o DOM real em ordem de documento (não clone)
- Identifica área de conteúdo: `<main>`, `<article>`, `.post-content`, etc.
- Rejeita subárvores inteiras: `header`, `footer`, `nav`, `aside`, `.sidebar`, `.menu`, etc.
- Cada `H2/H3/H4` abre novo chunk; parágrafos acumulam até o próximo heading
- `H1` é capturado como título da página (não vira chunk próprio)
- Quebra automática a cada 350 palavras (evita chunks gigantes)
- Chunks < 30 palavras são descartados
- Máximo 12 chunks por página

**Análise local (sem API):**
- `_analyzeChunkLocal()`: 3-element check heurístico, ARI, contagem de verbos relacionais
- `_checkHeadingVector()`: verifica se H2 é semanticamente relacionado ao H1

### Google NL API — analyzeChunkNL()

Endpoint: `POST /v1/documents:annotateText`
Features: `extractEntities: true, extractSyntax: true`

Retorna por chunk:
- Entidades com `salience` (0-100%), tipo (ORGANIZATION, PERSON, CONSUMER_GOOD, LOCATION, etc.) e `mentions[].beginOffset`
- Tokens com `partOfSpeech.tag` e `dependencyEdge.label`
- S-P-O real via dependency parsing: `NSUBJ` = sujeito, `ROOT` = verbo, `DOBJ/ATTR/POBJ` = objeto
- Flag `primaryAsSubject`: entidade principal aparece como sujeito gramatical?

### NVIDIA NIM — analyzeChunkNVIDIA()

Endpoint: `POST https://integrate.api.nvidia.com/v1/chat/completions`
Modelo: `meta/llama-4-maverick-17b-128e-instruct` (padrão, configurável)

Prompt estruturado que força JSON de saída:
```json
{
  "hasFact": true,
  "hasNumber": true,
  "hasConclusion": false,
  "intentLayer": "Definicao",
  "eavTriples": [{"entity": "...", "attribute": "...", "value": "..."}],
  "ariScore": 8,
  "aeoScore": 7
}
```

**8 Intent Layers disponíveis:** Problema | Comparacao | Resultado | Processo | Definicao | Especificacao | Negativo | UsoCaso

### Score por chunk — calcChunkScore()

```
SCORE (0-100) =
  entity_salience     × 0.30   (salience% da entidade primária via NL API)
  chunk_completeness  × 0.25   (150-350 palavras = 100, 80-149 = 60, <80 = 30)
  spo_coverage        × 0.20   (tem S-P-O detectado = 100, senão = 0)
  3element_llm        × 0.15   (quantos dos 3 elementos tem / 3 × 100)
  data_chunk_presence × 0.10   (atributo data-chunk presente = 100, senão = 0)
```

**Escala:** A+ ≥90 | A ≥80 | B ≥70 | C ≥60 | D <60

### Painel de 5 Experts

| Expert | Critério | Threshold pass/warn |
|--------|----------|---------------------|
| Kyle Byers | 3-Element LLM Check (% chunks com fato+número+conclusão) | ≥70% / ≥50% |
| Cindy Krum | Chunks citáveis (150-300 words) | ≥60% / ≥40% |
| InLinks | Entity Salience média (%) | ≥65% / ≥45% |
| Aleyda Solis | AEO Score médio NVIDIA (0-10) | ≥6 / ≥4 |
| Eli Schwartz | Intent Layer diversity (camadas distintas) | ≥3 / ≥2 |

### Botão "Analisar com IA" — buildChunksPrompt()

Monta um prompt de ~3.000 tokens com todo o contexto e envia para Claude/ChatGPT/Gemini/Perplexity via URL encodada. O prompt instrui a IA a produzir:

**Etapa 1 — Diagnóstico Global:** entidade D1, entidades D2, canibalização, Entity Salience Formula

**Etapa 2 — Tabela comparativa por chunk:** Estado Atual vs. Estado Otimizado (8 dimensões: H2, 3-element, S-P-O, EAV, intent layer, entity salience, AEO score)

**Etapa 3 — Reescrita dos 3 piores chunks:** primeira frase, última frase, EAV triple a inserir, S-P-O que deve guiar o parágrafo

**Etapa 4 — Entidades faltantes:** D1 ausente como sujeito, D2 ausentes, vector clusters recomendados

**Etapa 5 — Score projetado:** estimativa após aplicar as sugestões

---

## APIs utilizadas

| API | Onde | Para que | Chave |
|-----|------|----------|-------|
| Google Natural Language API | Headings + Chunks AEO | Extração de entidades + salience + dependency parsing (S-P-O real) | `NLP_API_KEY` em popup.js / Config |
| NVIDIA NIM | Chunks AEO + Chat Config | Análise qualitativa por chunk (hasFact, EAV, intent, AEO score) | Configurar em Config → NVIDIA NIM |
| PageSpeed Insights | Aba Speed | Core Web Vitals (LCP, CLS, FCP, TTFB) | Configurar em Config |
| OpenAI / Anthropic / Gemini / Perplexity | Botões "Analisar com IA" | Recebem prompt encodado via URL (sem key — abre na interface web) | Chaves opcionais para uso futuro |

---

## Content Scripts — o que roda em segundo plano

| Script | Contexto | Função |
|--------|----------|--------|
| `img_collector.js` | Todas as páginas (document_start) | Coleta imagens em 9 camadas antes do DOM finalizar |
| `paa_extractor.js` | Google Search | Extrai e expande "Pessoas Também Perguntam" automaticamente |
| `aio_monitor.js` | Google Search | Detecta AI Overview, captura texto e fontes citadas, classifica em quadrante Q1-Q4 |
| `index_extractor.js` | Google Search | Extrai URLs indexadas via operador `site:` |
| `sc_extractor.js` | Search Console | Captura top 50 queries da conta conectada |

---

## Background Service Worker (background.js)

- **Image Header Cache:** intercepta respostas HTTP de imagens, captura `content-length` e `content-type` (limite: 2.000 URLs)
- **Badge dinâmico:** exibe score on-page no ícone da extensão com cor proporcional (verde/amarelo/laranja/vermelho)
- **Message handlers:** roteador de mensagens entre popup e content scripts
  - `NVIDIA_API_CALL` — chamada não-streaming para NVIDIA NIM
  - `NVIDIA_API_STREAM` — chamada SSE streaming
  - `openDashboard` / `openGraphFullscreen` / `openLinksFullscreen` / `openCrawlFullscreen` / `openMindmap`
  - `getCache` / `setCache` — session storage por aba

---

## Conceitos semânticos implementados

### Entity Salience Formula (InLinks / R30)
```
Salience Score = (título×0.4) + (primeiros 300 words×0.3) + (H2s×0.2) + (schema×0.1)
Target: >0.7 para entidade primária
```

### 3-Element LLM Check (Kyle Byers)
Cada chunk precisa de 3 elementos para ter alta probabilidade de citação por IA:
1. **Fato ou definição** na primeira frase (não warm-up)
2. **Dado numérico específico** no corpo
3. **Conclusão acionável** na última frase

### EAV Triples — Entity-Attribute-Value (Bill Slawski / InLinks)
Formato: `[Entidade] → [Atributo] → [Valor]`
Exemplo: `Move Máquinas → capacidade máxima → 5 toneladas`
Nunca só implícitas — devem aparecer como declarações explícitas no texto.

### S-P-O — Sujeito-Predicado-Objeto
Detectado via dependency parsing real (Google NL API `analyzeSyntax`):
- `NSUBJ` token = sujeito
- `ROOT` token = verbo/predicado
- `DOBJ / ATTR / POBJ` token = objeto

### Heading Vector (Koray Tugberk)
H1 → H2 → H3 devem formar um vetor semântico linear:
- H1 estabelece o macro context
- H2 é consequência semântica do H1
- H3 adiciona qualificador ("Quando X", "Para Y", "Se Z")

### ARI — Automated Readability Index
```
ARI = 4.71 × (chars/words) + 0.5 × (words/sentences) - 21.43
```
Meta: ARI 6-9 (grau escolar ideal para citação por IA). ARI > 12 = conteúdo difícil, menor probabilidade de citação.

### Intent Layers (Koray FAQ Framework)
8 camadas de intenção cobertas pela análise:
`Problema | Comparacao | Resultado | Processo | Definicao | Especificacao | Negativo | UsoCaso`

---

## Como enviar para a IA analisar o código

### Opção 1 — Arrastar arquivos no Claude.ai / ChatGPT
1. Abrir [claude.ai](https://claude.ai) ou [chatgpt.com](https://chatgpt.com)
2. Arrastar os arquivos principais para o chat:
   - `content_analyzer.js` — engine de análise e extração de chunks
   - `popup.js` — toda a lógica de render e APIs
   - `popup.html` — estrutura da interface
   - `popup.css` — estilos
   - `manifest.json` — configuração
3. Colar o prompt abaixo

### Opção 2 — Usar o botão "Analisar com IA" da própria extensão
Dentro da aba **Chunks AEO**, após a análise terminar, clicar em **Analisar com IA** e escolher Claude ou ChatGPT. O prompt com todo o contexto da página é enviado automaticamente.

### Prompt de abertura para o programador
```
Você vai analisar uma extensão Chrome MV3 de análise SEO/GEO/AEO chamada "SEO Analyzer" (Maturare).

Os arquivos enviados contêm:
- content_analyzer.js: engine que roda na página analisada — extrai headings, links, imagens, schema JSON-LD, análise semântica HTML, e chunks de conteúdo (função analyzeChunks())
- popup.js: interface da extensão — renderiza 13 abas, orquestra chamadas para Google NL API e NVIDIA NIM, calcula scores GEO/AEO por chunk
- popup.html: estrutura HTML das 13 abas
- popup.css: sistema de design completo (dark/light/paper themes)
- manifest.json: configuração MV3

Foco principal: a aba "Chunks AEO" (nova funcionalidade).
Ela extrai chunks do conteúdo da página via TreeWalker, analisa cada chunk com:
1. Google NL API (annotateText) — entidades + salience + dependency parsing para S-P-O real
2. NVIDIA NIM (Llama 4 Maverick) — análise qualitativa: hasFact, hasNumber, hasConclusion, intentLayer, eavTriples, ariScore, aeoScore
3. calcChunkScore() — fórmula composta: entity_salience×0.30 + chunk_completeness×0.25 + spo_coverage×0.20 + 3element_llm×0.15 + data_chunk_presence×0.10

O botão "Analisar com IA" monta um prompt de ~3.000 tokens com todo o contexto e abre Claude/ChatGPT/Gemini/Perplexity para comparação antes/depois dos chunks.

O que quero que você analise: [DESCREVA AQUI O QUE QUER MELHORAR OU DEBUGAR]
```

---

## Roadmap / próximas funcionalidades

- [ ] Comparador visual lado a lado (chunks atuais vs. sugestão da IA) na própria extensão
- [ ] Export do relatório de chunks em PDF/PNG para apresentação ao cliente
- [ ] Cache de análise por URL (evitar re-processar páginas já analisadas)
- [ ] Score histórico: comparar resultado atual com análise anterior
- [ ] Integração com Notion para salvar diagnósticos por cliente
- [ ] Suporte a análise de múltiplas páginas em lote (via crawler)

---

## Desenvolvido por

**Maturare** — Agência SEO / GEO / AEO  
Site: [maturare.com.br](https://maturare.com.br)  
GitHub: [danielbatistarios](https://github.com/danielbatistarios)
