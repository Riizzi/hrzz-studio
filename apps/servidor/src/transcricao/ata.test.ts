import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { comoAnexo, expandirAta, idValido, listarSalvas } from './ata.js';

function pastaComTranscricoes() {
  const base = mkdtempSync(join(tmpdir(), 'hrzz-ata-'));
  const tr = join(base, 'transcricoes');
  const anexos = join(base, 'anexos');
  mkdirSync(tr);
  const grava = (id: string, titulo: string, criada: string) => {
    writeFileSync(join(tr, `${id}.json`), JSON.stringify({ id, titulo, criada, idioma: 'pt', duracao: 60, segmentos: [] }));
    writeFileSync(join(tr, `${id}.txt`), `${titulo}\n\ntexto de ${titulo}\n`);
  };
  return { base, tr, anexos, grava };
}

test('listarSalvas ordena da mais nova pra mais antiga e ignora json quebrado', () => {
  const { base, tr, grava } = pastaComTranscricoes();
  grava('20261101-100000-a', 'reuniao A', '2026-11-01T10:00:00');
  grava('20261110-100000-b', 'reuniao B', '2026-11-10T10:00:00');
  writeFileSync(join(tr, 'quebrado.json'), '{ nao e json');
  assert.deepEqual(listarSalvas(tr).map((t) => t.titulo), ['reuniao B', 'reuniao A']);
  assert.deepEqual(listarSalvas(join(base, 'nao-existe')), []);
  rmSync(base, { recursive: true, force: true });
});

test('idValido recusa caminho e maiuscula', () => {
  assert.equal(idValido('20261101-100000-reuniao'), true);
  assert.equal(idValido('../segredo'), false);
  assert.equal(idValido('A'), false);
  assert.equal(idValido(''), false);
});

test('comoAnexo copia o .txt pra pasta de anexos e usa o titulo', () => {
  const { base, tr, anexos, grava } = pastaComTranscricoes();
  grava('20261110-100000-b', 'reuniao B', '2026-11-10T10:00:00');
  const a = comoAnexo(tr, anexos, '20261110-100000-b');
  assert.ok(a && existsSync(a.caminho));
  assert.equal(a.titulo, 'reuniao B');
  assert.ok(a.caminho.startsWith(anexos));
  assert.match(readFileSync(a.caminho, 'utf8'), /texto de reuniao B/);
  assert.equal(comoAnexo(tr, anexos, '../hrzz'), null);
  assert.equal(comoAnexo(tr, anexos, 'nao-existe'), null);
  rmSync(base, { recursive: true, force: true });
});

test('/ata: usa a ultima transcricao, aceita instrucao extra e deixa as outras mensagens em paz', () => {
  const { base, tr, anexos, grava } = pastaComTranscricoes();
  assert.equal(expandirAta('oi', tr, anexos), null);
  assert.equal(expandirAta('/atas', tr, anexos), null);
  const semNada = expandirAta('/ata', tr, anexos);
  assert.ok(semNada && 'erro' in semNada, 'sem transcricao devolve erro');
  grava('20261101-100000-a', 'reuniao A', '2026-11-01T10:00:00');
  grava('20261110-100000-b', 'reuniao B', '2026-11-10T10:00:00');
  const r = expandirAta('/ata foco nas decisões', tr, anexos);
  assert.ok(r && 'texto' in r);
  assert.match(r.texto, /ata da reunião "reuniao B"/);
  assert.match(r.texto, /Instruções extras: foco nas decisões/);
  assert.equal(r.anexo.nome, '20261110-100000-b.txt');
  assert.ok(existsSync(r.anexo.caminho));
  const puro = expandirAta('  /ATA  ', tr, anexos);
  assert.ok(puro && 'texto' in puro && !puro.texto.includes('Instruções extras'));
  rmSync(base, { recursive: true, force: true });
});
