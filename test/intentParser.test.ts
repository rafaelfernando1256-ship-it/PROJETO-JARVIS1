import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntent } from "../src/voice/intentParser.js";

test("liga a tv da sala -> power_on", () => {
  const intent = parseIntent("liga a tv da sala");
  assert.equal(intent.action, "power_on");
  assert.equal(intent.targetQuery, "tv sala");
});

test("desliga a tv do quarto -> power_off", () => {
  const intent = parseIntent("desliga a tv do quarto");
  assert.equal(intent.action, "power_off");
  assert.equal(intent.targetQuery, "tv quarto");
});

test("aumenta o volume da caixa de som -> volume_up", () => {
  const intent = parseIntent("aumenta o volume da caixa de som");
  assert.equal(intent.action, "volume_up");
  assert.match(intent.targetQuery ?? "", /caixa/);
});

test("diminui o volume -> volume_down sem alvo especifico", () => {
  const intent = parseIntent("diminui o volume");
  assert.equal(intent.action, "volume_down");
});

test("coloca o volume da tv em 30 -> volume_set com amount", () => {
  const intent = parseIntent("coloca o volume da tv em 30");
  assert.equal(intent.action, "volume_set");
  assert.equal(intent.amount, 30);
});

test("muta a caixa de som -> mute_toggle", () => {
  const intent = parseIntent("muta a caixa de som");
  assert.equal(intent.action, "mute_toggle");
});

test("qual o status da tv -> status", () => {
  const intent = parseIntent("qual o status da tv");
  assert.equal(intent.action, "status");
});

test("comando sem sentido -> unknown", () => {
  const intent = parseIntent("banana amarela xyz");
  assert.equal(intent.action, "unknown");
});

test("acentos sao normalizados", () => {
  const intent = parseIntent("ligue a televisão");
  assert.equal(intent.action, "power_on");
});
