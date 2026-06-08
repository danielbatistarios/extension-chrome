// ══════════════════════════════════════════════════════════════════════════════
// i18n.js — Sistema de internacionalização da extensão SEO Analyzer
// Carregado pelo popup.html antes do popup.js
// Uso: t('key') retorna string no idioma ativo. Fallback: 'en'
// Idioma ativo lido de chrome.storage.sync → seo_language
// ══════════════════════════════════════════════════════════════════════════════

const I18N_STRINGS = {

  // ── Inglês (base) ──────────────────────────────────────────────────────────
  en: {
    // Tabs
    tab_360:      '360',
    tab_overview: 'Overview',
    tab_headings: 'Headings',
    tab_links:    'Links',
    tab_images:   'Images',
    tab_schema:   'Schema',
    tab_checks:   'Checks',
    tab_graph:    'Graph',
    tab_speed:    'Speed',
    tab_semantic: 'Semantic',
    tab_chunks:   'Chunks',
    tab_index:    'Index',
    tab_config:   'Config',

    // Overview
    analyze_with_ai:    'Analyze with AI',
    copy:               'Copy',
    loading:            'Loading...',
    no_data:            'No data available',

    // Chunks AEO
    chunks_score_label:   'GEO / AEO Score',
    chunks_analyzing:     'Analyzing...',
    chunks_detected:      'chunks detected',
    chunks_expert_panel:  'Expert Panel',
    chunks_diagnosis:     'Final Diagnosis',
    chunks_nl_api:        'Entities — Google NL API',
    chunks_spo:           'Subject → Predicate → Object',
    chunks_eav:           'EAV Triples — NVIDIA NIM',
    chunks_qualitative:   'Qualitative Analysis — NVIDIA NIM',
    chunks_hv:            'Heading Vector',
    chunks_hv_ok:         '✓ H2 related to H1',
    chunks_hv_warn:       '⚠ H2 not clearly related to H1',
    chunks_hv_na:         '— N/A',
    chunks_no_eav:        'No EAV triples extracted',
    chunks_no_spo:        'No S-P-O structure identified',
    chunks_not_processed: 'API not processed',
    chunks_no_nvidia:     '⟳ NVIDIA not configured or missing API key',
    chunks_intent:        'Intent Layer',
    chunks_ari:           'ARI Score',
    chunks_grade_a_plus:  'Grade A+',
    chunks_grade_a:       'Grade A',
    chunks_grade_b:       'Grade B',
    chunks_grade_c:       'Grade C',
    chunks_grade_d:       'Grade D',
    chunks_strong:        'Well structured content for AI citation',
    chunks_medium:        'Improvements needed in some chunks',
    chunks_weak:          'Weak semantic structure — review chunks',
    chunks_waiting_ai:    'Wait for chunk analysis to finish before sending to AI.',
    chunks_preparing:     'Preparing...',

    // Config
    cfg_language:         'Interface Language',
    cfg_language_sub:     'Changes apply immediately. APIs will use this language.',
    cfg_save:             'Save',
    cfg_saved:            '✓ Saved',

    // Shared
    pass: 'Pass',
    warn: 'Warning',
    fail: 'Fail',
    words: 'words',
    na:   'N/A',
    ideal: '(ideal)',
    medium_diff: '(medium)',
    hard: '(hard)',
  },

  // ── Português ──────────────────────────────────────────────────────────────
  pt: {
    tab_360:      '360',
    tab_overview: 'Visão Geral',
    tab_headings: 'Títulos',
    tab_links:    'Links',
    tab_images:   'Imagens',
    tab_schema:   'Schema',
    tab_checks:   'Verificações',
    tab_graph:    'Grafo',
    tab_speed:    'Velocidade',
    tab_semantic: 'Semântico',
    tab_chunks:   'Chunks',
    tab_index:    'Índice',
    tab_config:   'Config',

    analyze_with_ai:    'Analisar com IA',
    copy:               'Copiar',
    loading:            'Carregando...',
    no_data:            'Sem dados disponíveis',

    chunks_score_label:   'Score GEO / AEO',
    chunks_analyzing:     'Analisando...',
    chunks_detected:      'chunks detectados',
    chunks_expert_panel:  'Painel de Experts',
    chunks_diagnosis:     'Diagnóstico Final',
    chunks_nl_api:        'Entidades — Google NL API',
    chunks_spo:           'Sujeito → Predicado → Objeto',
    chunks_eav:           'EAV Triples — NVIDIA NIM',
    chunks_qualitative:   'Análise Qualitativa — NVIDIA NIM',
    chunks_hv:            'Heading Vector',
    chunks_hv_ok:         '✓ H2 relacionado ao H1',
    chunks_hv_warn:       '⚠ H2 sem relação clara com H1',
    chunks_hv_na:         '— N/A',
    chunks_no_eav:        'Nenhuma EAV triple extraída',
    chunks_no_spo:        'Nenhuma estrutura S-P-O identificada',
    chunks_not_processed: 'API não processada',
    chunks_no_nvidia:     '⟳ NVIDIA não configurado ou sem chave API',
    chunks_intent:        'Intent Layer',
    chunks_ari:           'ARI Score',
    chunks_grade_a_plus:  'Grau A+',
    chunks_grade_a:       'Grau A',
    chunks_grade_b:       'Grau B',
    chunks_grade_c:       'Grau C',
    chunks_grade_d:       'Grau D',
    chunks_strong:        'Conteúdo bem estruturado para citação por IA',
    chunks_medium:        'Melhorias necessárias em alguns chunks',
    chunks_weak:          'Estrutura semântica fraca — revisar chunks',
    chunks_waiting_ai:    'Aguarde a análise de chunks terminar antes de enviar para IA.',
    chunks_preparing:     'Preparando...',

    cfg_language:         'Idioma da Interface',
    cfg_language_sub:     'Alterações aplicadas imediatamente. APIs usarão este idioma.',
    cfg_save:             'Salvar',
    cfg_saved:            '✓ Salvo',

    pass: 'OK',
    warn: 'Atenção',
    fail: 'Falha',
    words: 'palavras',
    na:   'N/A',
    ideal: '(ideal)',
    medium_diff: '(médio)',
    hard: '(difícil)',
  },

  // ── Espanhol ───────────────────────────────────────────────────────────────
  es: {
    tab_360:      '360',
    tab_overview: 'Resumen',
    tab_headings: 'Títulos',
    tab_links:    'Enlaces',
    tab_images:   'Imágenes',
    tab_schema:   'Schema',
    tab_checks:   'Revisiones',
    tab_graph:    'Grafo',
    tab_speed:    'Velocidad',
    tab_semantic: 'Semántico',
    tab_chunks:   'Chunks',
    tab_index:    'Índice',
    tab_config:   'Config',

    analyze_with_ai:    'Analizar con IA',
    copy:               'Copiar',
    loading:            'Cargando...',
    no_data:            'Sin datos disponibles',

    chunks_score_label:   'Score GEO / AEO',
    chunks_analyzing:     'Analizando...',
    chunks_detected:      'chunks detectados',
    chunks_expert_panel:  'Panel de Expertos',
    chunks_diagnosis:     'Diagnóstico Final',
    chunks_nl_api:        'Entidades — Google NL API',
    chunks_spo:           'Sujeto → Predicado → Objeto',
    chunks_eav:           'Triples EAV — NVIDIA NIM',
    chunks_qualitative:   'Análisis Cualitativo — NVIDIA NIM',
    chunks_hv:            'Vector de Encabezados',
    chunks_hv_ok:         '✓ H2 relacionado con H1',
    chunks_hv_warn:       '⚠ H2 sin relación clara con H1',
    chunks_hv_na:         '— N/A',
    chunks_no_eav:        'Ninguna triple EAV extraída',
    chunks_no_spo:        'Ninguna estructura S-P-O identificada',
    chunks_not_processed: 'API no procesada',
    chunks_no_nvidia:     '⟳ NVIDIA no configurado o sin clave API',
    chunks_intent:        'Capa de Intención',
    chunks_ari:           'Puntuación ARI',
    chunks_grade_a_plus:  'Grado A+',
    chunks_grade_a:       'Grado A',
    chunks_grade_b:       'Grado B',
    chunks_grade_c:       'Grado C',
    chunks_grade_d:       'Grado D',
    chunks_strong:        'Contenido bien estructurado para citas por IA',
    chunks_medium:        'Se necesitan mejoras en algunos chunks',
    chunks_weak:          'Estructura semántica débil — revisar chunks',
    chunks_waiting_ai:    'Espera a que termine el análisis antes de enviar a IA.',
    chunks_preparing:     'Preparando...',

    cfg_language:         'Idioma de la Interfaz',
    cfg_language_sub:     'Los cambios se aplican de inmediato. Las APIs usarán este idioma.',
    cfg_save:             'Guardar',
    cfg_saved:            '✓ Guardado',

    pass: 'OK',
    warn: 'Atención',
    fail: 'Fallo',
    words: 'palabras',
    na:   'N/A',
    ideal: '(ideal)',
    medium_diff: '(medio)',
    hard: '(difícil)',
  },

  // ── Alemão ─────────────────────────────────────────────────────────────────
  de: {
    tab_360:      '360',
    tab_overview: 'Übersicht',
    tab_headings: 'Überschriften',
    tab_links:    'Links',
    tab_images:   'Bilder',
    tab_schema:   'Schema',
    tab_checks:   'Prüfungen',
    tab_graph:    'Graph',
    tab_speed:    'Geschw.',
    tab_semantic: 'Semantik',
    tab_chunks:   'Chunks',
    tab_index:    'Index',
    tab_config:   'Konfig',

    analyze_with_ai:    'Mit KI analysieren',
    copy:               'Kopieren',
    loading:            'Lädt...',
    no_data:            'Keine Daten verfügbar',

    chunks_score_label:   'GEO / AEO Score',
    chunks_analyzing:     'Analysiere...',
    chunks_detected:      'Chunks erkannt',
    chunks_expert_panel:  'Expertenpanel',
    chunks_diagnosis:     'Abschlussdiagnose',
    chunks_nl_api:        'Entitäten — Google NL API',
    chunks_spo:           'Subjekt → Prädikat → Objekt',
    chunks_eav:           'EAV-Tripel — NVIDIA NIM',
    chunks_qualitative:   'Qualitative Analyse — NVIDIA NIM',
    chunks_hv:            'Überschriftenvektor',
    chunks_hv_ok:         '✓ H2 mit H1 verwandt',
    chunks_hv_warn:       '⚠ H2 ohne klaren Bezug zu H1',
    chunks_hv_na:         '— N/A',
    chunks_no_eav:        'Keine EAV-Tripel extrahiert',
    chunks_no_spo:        'Keine S-P-O-Struktur erkannt',
    chunks_not_processed: 'API nicht verarbeitet',
    chunks_no_nvidia:     '⟳ NVIDIA nicht konfiguriert oder kein API-Schlüssel',
    chunks_intent:        'Absichtsebene',
    chunks_ari:           'ARI-Wert',
    chunks_grade_a_plus:  'Note A+',
    chunks_grade_a:       'Note A',
    chunks_grade_b:       'Note B',
    chunks_grade_c:       'Note C',
    chunks_grade_d:       'Note D',
    chunks_strong:        'Gut strukturierter Inhalt für KI-Zitate',
    chunks_medium:        'Verbesserungen in einigen Chunks erforderlich',
    chunks_weak:          'Schwache Semantik — Chunks überarbeiten',
    chunks_waiting_ai:    'Warte auf Chunk-Analyse vor dem Senden an KI.',
    chunks_preparing:     'Vorbereitung...',

    cfg_language:         'Oberflächensprache',
    cfg_language_sub:     'Änderungen sofort wirksam. APIs verwenden diese Sprache.',
    cfg_save:             'Speichern',
    cfg_saved:            '✓ Gespeichert',

    pass: 'OK',
    warn: 'Warnung',
    fail: 'Fehler',
    words: 'Wörter',
    na:   'N/A',
    ideal: '(ideal)',
    medium_diff: '(mittel)',
    hard: '(schwer)',
  },

  // ── Francês ────────────────────────────────────────────────────────────────
  fr: {
    tab_360:      '360',
    tab_overview: 'Aperçu',
    tab_headings: 'Titres',
    tab_links:    'Liens',
    tab_images:   'Images',
    tab_schema:   'Schema',
    tab_checks:   'Vérif.',
    tab_graph:    'Graphe',
    tab_speed:    'Vitesse',
    tab_semantic: 'Sémant.',
    tab_chunks:   'Chunks',
    tab_index:    'Index',
    tab_config:   'Config',

    analyze_with_ai:    'Analyser avec IA',
    copy:               'Copier',
    loading:            'Chargement...',
    no_data:            'Aucune donnée disponible',

    chunks_score_label:   'Score GEO / AEO',
    chunks_analyzing:     'Analyse en cours...',
    chunks_detected:      'chunks détectés',
    chunks_expert_panel:  'Panel d\'Experts',
    chunks_diagnosis:     'Diagnostic Final',
    chunks_nl_api:        'Entités — Google NL API',
    chunks_spo:           'Sujet → Prédicat → Objet',
    chunks_eav:           'Triplets EAV — NVIDIA NIM',
    chunks_qualitative:   'Analyse Qualitative — NVIDIA NIM',
    chunks_hv:            'Vecteur de Titres',
    chunks_hv_ok:         '✓ H2 lié au H1',
    chunks_hv_warn:       '⚠ H2 sans lien clair avec H1',
    chunks_hv_na:         '— N/A',
    chunks_no_eav:        'Aucun triplet EAV extrait',
    chunks_no_spo:        'Aucune structure S-P-O identifiée',
    chunks_not_processed: 'API non traitée',
    chunks_no_nvidia:     '⟳ NVIDIA non configuré ou clé API manquante',
    chunks_intent:        'Couche d\'intention',
    chunks_ari:           'Score ARI',
    chunks_grade_a_plus:  'Note A+',
    chunks_grade_a:       'Note A',
    chunks_grade_b:       'Note B',
    chunks_grade_c:       'Note C',
    chunks_grade_d:       'Note D',
    chunks_strong:        'Contenu bien structuré pour les citations IA',
    chunks_medium:        'Des améliorations sont nécessaires dans certains chunks',
    chunks_weak:          'Structure sémantique faible — réviser les chunks',
    chunks_waiting_ai:    'Attendez la fin de l\'analyse avant d\'envoyer à l\'IA.',
    chunks_preparing:     'Préparation...',

    cfg_language:         'Langue de l\'interface',
    cfg_language_sub:     'Les modifications s\'appliquent immédiatement. Les APIs utiliseront cette langue.',
    cfg_save:             'Enregistrer',
    cfg_saved:            '✓ Enregistré',

    pass: 'OK',
    warn: 'Attention',
    fail: 'Échec',
    words: 'mots',
    na:   'N/A',
    ideal: '(idéal)',
    medium_diff: '(moyen)',
    hard: '(difficile)',
  },

  // ── Chinês Simplificado ────────────────────────────────────────────────────
  zh: {
    tab_360:      '360',
    tab_overview: '概览',
    tab_headings: '标题',
    tab_links:    '链接',
    tab_images:   '图片',
    tab_schema:   'Schema',
    tab_checks:   '检查',
    tab_graph:    '图谱',
    tab_speed:    '速度',
    tab_semantic: '语义',
    tab_chunks:   '分块',
    tab_index:    '索引',
    tab_config:   '设置',

    analyze_with_ai:    '用AI分析',
    copy:               '复制',
    loading:            '加载中...',
    no_data:            '暂无数据',

    chunks_score_label:   'GEO / AEO 评分',
    chunks_analyzing:     '分析中...',
    chunks_detected:      '个分块已检测',
    chunks_expert_panel:  '专家面板',
    chunks_diagnosis:     '最终诊断',
    chunks_nl_api:        '实体 — Google NL API',
    chunks_spo:           '主语 → 谓语 → 宾语',
    chunks_eav:           'EAV三元组 — NVIDIA NIM',
    chunks_qualitative:   '定性分析 — NVIDIA NIM',
    chunks_hv:            '标题向量',
    chunks_hv_ok:         '✓ H2与H1相关',
    chunks_hv_warn:       '⚠ H2与H1关联不明确',
    chunks_hv_na:         '— 不适用',
    chunks_no_eav:        '未提取到EAV三元组',
    chunks_no_spo:        '未识别到S-P-O结构',
    chunks_not_processed: 'API未处理',
    chunks_no_nvidia:     '⟳ NVIDIA未配置或缺少API密钥',
    chunks_intent:        '意图层',
    chunks_ari:           'ARI评分',
    chunks_grade_a_plus:  'A+级',
    chunks_grade_a:       'A级',
    chunks_grade_b:       'B级',
    chunks_grade_c:       'C级',
    chunks_grade_d:       'D级',
    chunks_strong:        '内容结构良好，适合AI引用',
    chunks_medium:        '部分分块需要改进',
    chunks_weak:          '语义结构薄弱 — 需审查分块',
    chunks_waiting_ai:    '请等待分块分析完成后再发送给AI。',
    chunks_preparing:     '准备中...',

    cfg_language:         '界面语言',
    cfg_language_sub:     '更改立即生效。API将使用此语言。',
    cfg_save:             '保存',
    cfg_saved:            '✓ 已保存',

    pass: '通过',
    warn: '警告',
    fail: '失败',
    words: '词',
    na:   '不适用',
    ideal: '(理想)',
    medium_diff: '(中等)',
    hard: '(困难)',
  },

  // ── Japonês ────────────────────────────────────────────────────────────────
  ja: {
    tab_360:      '360',
    tab_overview: '概要',
    tab_headings: '見出し',
    tab_links:    'リンク',
    tab_images:   '画像',
    tab_schema:   'スキーマ',
    tab_checks:   'チェック',
    tab_graph:    'グラフ',
    tab_speed:    '速度',
    tab_semantic: 'セマンティック',
    tab_chunks:   'チャンク',
    tab_index:    'インデックス',
    tab_config:   '設定',

    analyze_with_ai:    'AIで分析',
    copy:               'コピー',
    loading:            '読み込み中...',
    no_data:            'データなし',

    chunks_score_label:   'GEO / AEO スコア',
    chunks_analyzing:     '分析中...',
    chunks_detected:      'チャンク検出済み',
    chunks_expert_panel:  'エキスパートパネル',
    chunks_diagnosis:     '最終診断',
    chunks_nl_api:        'エンティティ — Google NL API',
    chunks_spo:           '主語 → 述語 → 目的語',
    chunks_eav:           'EAVトリプル — NVIDIA NIM',
    chunks_qualitative:   '定性分析 — NVIDIA NIM',
    chunks_hv:            '見出しベクトル',
    chunks_hv_ok:         '✓ H2はH1に関連',
    chunks_hv_warn:       '⚠ H2とH1の関連が不明確',
    chunks_hv_na:         '— 該当なし',
    chunks_no_eav:        'EAVトリプルなし',
    chunks_no_spo:        'S-P-O構造なし',
    chunks_not_processed: 'API未処理',
    chunks_no_nvidia:     '⟳ NVIDIA未設定またはAPIキーなし',
    chunks_intent:        '意図レイヤー',
    chunks_ari:           'ARIスコア',
    chunks_grade_a_plus:  'A+評価',
    chunks_grade_a:       'A評価',
    chunks_grade_b:       'B評価',
    chunks_grade_c:       'C評価',
    chunks_grade_d:       'D評価',
    chunks_strong:        'AI引用に適した構造',
    chunks_medium:        '一部のチャンクに改善が必要',
    chunks_weak:          '意味論的構造が弱い — チャンクを見直す',
    chunks_waiting_ai:    'AIに送信する前にチャンク分析が完了するまでお待ちください。',
    chunks_preparing:     '準備中...',

    cfg_language:         'インターフェース言語',
    cfg_language_sub:     '変更は即座に反映されます。APIもこの言語を使用します。',
    cfg_save:             '保存',
    cfg_saved:            '✓ 保存済み',

    pass: 'OK',
    warn: '警告',
    fail: '失敗',
    words: '語',
    na:   '該当なし',
    ideal: '(理想的)',
    medium_diff: '(普通)',
    hard: '(難しい)',
  },

  // ── Coreano ────────────────────────────────────────────────────────────────
  ko: {
    tab_360:      '360',
    tab_overview: '개요',
    tab_headings: '제목',
    tab_links:    '링크',
    tab_images:   '이미지',
    tab_schema:   '스키마',
    tab_checks:   '검사',
    tab_graph:    '그래프',
    tab_speed:    '속도',
    tab_semantic: '시맨틱',
    tab_chunks:   '청크',
    tab_index:    '색인',
    tab_config:   '설정',

    analyze_with_ai:    'AI로 분석',
    copy:               '복사',
    loading:            '로딩 중...',
    no_data:            '데이터 없음',

    chunks_score_label:   'GEO / AEO 점수',
    chunks_analyzing:     '분석 중...',
    chunks_detected:      '청크 감지됨',
    chunks_expert_panel:  '전문가 패널',
    chunks_diagnosis:     '최종 진단',
    chunks_nl_api:        '엔티티 — Google NL API',
    chunks_spo:           '주어 → 서술어 → 목적어',
    chunks_eav:           'EAV 트리플 — NVIDIA NIM',
    chunks_qualitative:   '정성적 분석 — NVIDIA NIM',
    chunks_hv:            '제목 벡터',
    chunks_hv_ok:         '✓ H2가 H1과 관련됨',
    chunks_hv_warn:       '⚠ H2와 H1의 관계가 불명확',
    chunks_hv_na:         '— 해당없음',
    chunks_no_eav:        'EAV 트리플 없음',
    chunks_no_spo:        'S-P-O 구조 없음',
    chunks_not_processed: 'API 미처리',
    chunks_no_nvidia:     '⟳ NVIDIA 미설정 또는 API 키 없음',
    chunks_intent:        '의도 레이어',
    chunks_ari:           'ARI 점수',
    chunks_grade_a_plus:  'A+ 등급',
    chunks_grade_a:       'A 등급',
    chunks_grade_b:       'B 등급',
    chunks_grade_c:       'C 등급',
    chunks_grade_d:       'D 등급',
    chunks_strong:        'AI 인용에 적합한 구조',
    chunks_medium:        '일부 청크 개선 필요',
    chunks_weak:          '의미론적 구조 취약 — 청크 재검토',
    chunks_waiting_ai:    'AI로 전송하기 전에 청크 분석이 완료될 때까지 기다리세요.',
    chunks_preparing:     '준비 중...',

    cfg_language:         '인터페이스 언어',
    cfg_language_sub:     '변경사항이 즉시 적용됩니다. API도 이 언어를 사용합니다.',
    cfg_save:             '저장',
    cfg_saved:            '✓ 저장됨',

    pass: '통과',
    warn: '경고',
    fail: '실패',
    words: '단어',
    na:   '해당없음',
    ideal: '(이상적)',
    medium_diff: '(보통)',
    hard: '(어려움)',
  },

  // ── Tailandês, Vietnamita, Indonésio, Malaio — fallback para inglês ────────
  th: null,
  vi: null,
  id: null,
  ms: null,
};

// ── Runtime state ─────────────────────────────────────────────────────────────
let _currentLang = 'en';

// Mapeamento de código de idioma para código da NL API do Google
const NL_API_LANG_MAP = {
  en: 'en', pt: 'pt', es: 'es', de: 'de', fr: 'fr',
  zh: 'zh', ja: 'ja', ko: 'ko', th: 'th', vi: 'vi',
  id: 'id', ms: 'ms',
};

// Mapeamento de código de idioma para instrução de idioma no prompt NVIDIA
const NVIDIA_LANG_INSTRUCTION = {
  en: 'Respond in English.',
  pt: 'Responda em português brasileiro.',
  es: 'Responde en español.',
  de: 'Antworte auf Deutsch.',
  fr: 'Répondez en français.',
  zh: '请用中文回答。',
  ja: '日本語で回答してください。',
  ko: '한국어로 답변해주세요.',
  th: 'ตอบเป็นภาษาไทย',
  vi: 'Trả lời bằng tiếng Việt.',
  id: 'Jawab dalam Bahasa Indonesia.',
  ms: 'Jawab dalam Bahasa Melayu.',
};

// ── API pública ────────────────────────────────────────────────────────────────

/**
 * Retorna string traduzida para a chave. Fallback: inglês → a própria chave.
 */
function t(key) {
  const dict = I18N_STRINGS[_currentLang] || I18N_STRINGS['en'];
  if (dict && dict[key] !== undefined) return dict[key];
  // Fallback para inglês
  const enDict = I18N_STRINGS['en'];
  return (enDict && enDict[key] !== undefined) ? enDict[key] : key;
}

/** Retorna o código de idioma atual */
function getCurrentLang() { return _currentLang; }

/** Retorna o código de idioma para a NL API do Google */
function getNLApiLang() { return NL_API_LANG_MAP[_currentLang] || 'en'; }

/** Retorna a instrução de idioma a inserir nos prompts NVIDIA */
function getNvidiaLangInstruction() { return NVIDIA_LANG_INSTRUCTION[_currentLang] || 'Respond in English.'; }

/**
 * Inicializa o sistema: lê chrome.storage.sync, define _currentLang,
 * aplica data-lang no <html> e resolve a Promise.
 * Chamar uma vez no DOMContentLoaded do popup antes de qualquer render.
 */
function i18nInit() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['seo_language'], result => {
      _currentLang = result.seo_language || 'en';
      document.documentElement.setAttribute('data-lang', _currentLang);
      applyI18nToDOM();
      resolve(_currentLang);
    });
  });
}

/**
 * Aplica traduções a todos os elementos com data-i18n="key".
 * Exemplo no HTML: <span data-i18n="tab_headings">Headings</span>
 */
function applyI18nToDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val) el.setAttribute('placeholder', val);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val) el.setAttribute('title', val);
  });
}

/**
 * Altera o idioma em runtime e persiste.
 * Usado pelo seletor de idioma na aba Config.
 */
function setLanguage(lang, callback) {
  _currentLang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  chrome.storage.sync.set({ seo_language: lang }, () => {
    applyI18nToDOM();
    if (callback) callback();
  });
}
