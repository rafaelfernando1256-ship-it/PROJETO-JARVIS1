import type { DeviceAction, ParsedIntent } from "../types.js";
import { normalize, tokenize } from "./textUtils.js";

interface Rule {
  action: DeviceAction;
  /** Regex (sem flag "g") que identifica a acao. Usa radicais de palavra para cobrir conjugacoes. */
  match: RegExp;
  /** Frases extras a remover ao extrair o alvo (nao capturadas pelo radical). */
  extraPhrases?: RegExp;
}

const RULES: Rule[] = [
  {
    action: "mute_toggle",
    match: /\b(mut\w*|desmut\w*|silenci\w*)\b/,
    extraPhrases: /sem som|tira o som|tirar o som/g,
  },
  {
    action: "volume_set",
    match: /\b(coloc\w*|deix\w*|ajust\w*|defin\w*|mud\w*)\b/,
  },
  {
    action: "volume_up",
    match: /\b(aument\w*|sob\w*|subi\w*)\b/,
    extraPhrases: /mais alto/g,
  },
  {
    action: "volume_down",
    match: /\b(diminu\w*|abaix\w*|desc\w*)\b/,
    extraPhrases: /mais baixo/g,
  },
  {
    action: "media_play",
    match: /\b(toc\w*|reproduz\w*|play)\b/,
  },
  {
    action: "media_pause",
    match: /\bpaus\w*\b/,
  },
  {
    action: "media_next",
    match: /\b(proxim\w*|pul\w*|avanc\w*)\b/,
  },
  {
    action: "media_prev",
    match: /\b(anterior\w*|volt\w*)\b/,
  },
  {
    action: "power_on",
    match: /\b(lig\w*|acend\w*|ativ\w*)\b/,
  },
  {
    action: "power_off",
    match: /\b(deslig\w*|apag\w*|desativ\w*)\b/,
  },
  {
    action: "status",
    match: /\b(status|estad\w*)\b/,
    extraPhrases: /como esta/g,
  },
];

// volume_set so dispara se houver um numero na frase (senao cai em volume_up/volume_down/outros).
function ruleApplies(rule: Rule, text: string): boolean {
  if (rule.action === "volume_set") {
    return rule.match.test(text) && /volume/.test(text) && /\d{1,3}/.test(text);
  }
  return rule.match.test(text);
}

const FILLER_WORDS = new Set(["volume", "som", "musica", "cento"]);

function extractAmount(text: string): number | undefined {
  const match = text.match(/(\d{1,3})/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

function extractTarget(text: string, rule: Rule): string {
  let cleaned = text.replace(new RegExp(rule.match.source, "g"), " ");
  if (rule.extraPhrases) cleaned = cleaned.replace(rule.extraPhrases, " ");
  cleaned = cleaned.replace(/\d{1,3}\s*(%|por cento)?/g, " ");

  return tokenize(cleaned)
    .filter((w) => !FILLER_WORDS.has(w))
    .join(" ");
}

export function parseIntent(rawText: string): ParsedIntent {
  const text = normalize(rawText);

  for (const rule of RULES) {
    if (ruleApplies(rule, text)) {
      const targetQuery = extractTarget(text, rule) || null;
      const amount =
        rule.action === "volume_set" || rule.action === "volume_up" || rule.action === "volume_down"
          ? extractAmount(text)
          : undefined;
      return { action: rule.action, targetQuery, amount, raw: rawText };
    }
  }

  return { action: "unknown", targetQuery: null, raw: rawText };
}
