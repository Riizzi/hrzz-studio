import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Versionador } from './git.js';

function pastaTemp(): string {
  return mkdtempSync(join(tmpdir(), 'hrzz-git-'));
}

test('pasta sem git: ponto de retorno, desfazer (arquivo editado e arquivo novo) e nada pra desfazer', async () => {
  const sombra = pastaTemp();
  const pasta = pastaTemp();
  try {
    const v = new Versionador(sombra);
    const a = { chave: 'p1', pasta };
    writeFileSync(join(pasta, 'index.html'), '<h1>oi</h1>');
    mkdirSync(join(pasta, 'node_modules'));
    writeFileSync(join(pasta, 'node_modules', 'lixo.js'), 'x');

    assert.ok(await v.criarPonto(a, 'primeiro'));
    assert.equal(await v.criarPonto(a, 'igual'), null, 'sem mudanca nao cria outro ponto');

    // a IA mexe: edita um arquivo e cria outro
    writeFileSync(join(pasta, 'index.html'), '<h1>tchau</h1>');
    writeFileSync(join(pasta, 'novo.css'), 'body{}');
    assert.ok(await v.criarPonto(a, 'segundo'));
    writeFileSync(join(pasta, 'index.html'), '<h1>tchau</h1>');
    assert.equal((await v.listarPontos(a)).length, 2);

    // desfaz: o ponto mais novo (segundo) e igual ao atual? nao: "segundo" foi tirado ANTES da proxima mudanca
    writeFileSync(join(pasta, 'index.html'), '<h1>depois</h1>');
    const r = await v.desfazer(a);
    assert.equal(r.ok, true);
    assert.equal(readFileSync(join(pasta, 'index.html'), 'utf8'), '<h1>tchau</h1>');
    assert.ok(existsSync(join(pasta, 'novo.css')));

    // desfaz de novo: volta pro primeiro (index velho e sem o novo.css)
    const r2 = await v.desfazer(a);
    assert.equal(r2.ok, true);
    assert.equal(readFileSync(join(pasta, 'index.html'), 'utf8'), '<h1>oi</h1>');
    assert.equal(existsSync(join(pasta, 'novo.css')), false, 'arquivo criado depois do ponto some');
    assert.ok(existsSync(join(pasta, 'node_modules', 'lixo.js')), 'node_modules nunca e tocado');

    const r3 = await v.desfazer(a);
    assert.equal(r3.ok, false);
    assert.equal(r3.mensagem, 'nada pra desfazer');
    assert.equal(existsSync(join(pasta, '.git')), false, 'a pasta do projeto nao ganha .git');
  } finally {
    rmSync(sombra, { recursive: true, force: true });
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('versoes: salvar, nome, listar, igual nao duplica, restaurar com ponto de retorno', async () => {
  const sombra = pastaTemp();
  const pasta = pastaTemp();
  try {
    const v = new Versionador(sombra);
    const a = { chave: 'p2', pasta };
    writeFileSync(join(pasta, 'a.txt'), 'um');
    const v1 = await v.salvarVersao(a, '');
    assert.equal(v1.versao.n, 1);
    assert.equal((await v.salvarVersao(a, 'repetida')).igual, true);

    writeFileSync(join(pasta, 'a.txt'), 'dois');
    writeFileSync(join(pasta, 'b.txt'), 'extra');
    const v2 = await v.salvarVersao(a, 'menu novo');
    assert.equal(v2.versao.n, 2);
    assert.equal(v2.versao.nome, 'menu novo');

    const lista = await v.listarVersoes(a);
    assert.deepEqual(lista.map((x) => x.n), [1, 2]);

    const r = await v.restaurarVersao(a, 1);
    assert.equal(r.ok, true);
    assert.equal(readFileSync(join(pasta, 'a.txt'), 'utf8'), 'um');
    assert.equal(existsSync(join(pasta, 'b.txt')), false);

    // dá pra desfazer o "voltar pra v1"
    const d = await v.desfazer(a);
    assert.equal(d.ok, true);
    assert.equal(readFileSync(join(pasta, 'a.txt'), 'utf8'), 'dois');
    assert.ok(existsSync(join(pasta, 'b.txt')));

    assert.equal((await v.restaurarVersao(a, 9)).ok, false);
  } finally {
    rmSync(sombra, { recursive: true, force: true });
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('repositorio do projeto: usa o .git dele sem mexer no branch, no indice nem no HEAD', async () => {
  const sombra = pastaTemp();
  const pasta = pastaTemp();
  const g = (...args: string[]) => spawnSync('git', args, { cwd: pasta, encoding: 'utf8' });
  try {
    g('init', '-q');
    g('config', 'user.email', 't@t');
    g('config', 'user.name', 't');
    writeFileSync(join(pasta, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(pasta, 'site.html'), 'v1');
    g('add', '-A');
    g('commit', '-qm', 'inicio');
    const headAntes = g('rev-parse', 'HEAD').stdout.trim();
    const statusAntes = g('status', '--porcelain').stdout;

    const v = new Versionador(sombra);
    const a = { chave: 'p3', pasta };
    writeFileSync(join(pasta, 'site.html'), 'v2-sem-commit');
    await v.criarPonto(a, 'antes da IA');
    await v.salvarVersao(a, 'ok');

    assert.equal(g('rev-parse', 'HEAD').stdout.trim(), headAntes);
    // o arquivo continua "modificado" e nada foi colocado na area de preparo
    assert.equal(g('status', '--porcelain').stdout.trim(), 'M site.html');
    assert.notEqual(statusAntes, g('status', '--porcelain').stdout);
    assert.match(g('branch', '--list', 'hrzz/versoes').stdout, /hrzz\/versoes/);
    assert.equal(existsSync(join(sombra, 'p3.git')), false, 'sem repositorio sombra quando ha .git');
  } finally {
    rmSync(sombra, { recursive: true, force: true });
    rmSync(pasta, { recursive: true, force: true });
  }
});
