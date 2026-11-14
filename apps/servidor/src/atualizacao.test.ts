import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { atualizar, estadoGit, listarVersoes, voltarVersao } from './atualizacao.js';

process.env.GIT_AUTHOR_NAME = 'teste';
process.env.GIT_AUTHOR_EMAIL = 'teste@example.com';
process.env.GIT_COMMITTER_NAME = 'teste';
process.env.GIT_COMMITTER_EMAIL = 'teste@example.com';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// remoto "de mentira" + duas copias: a do HRZZ (a) e a de quem publica (b)
function montar(buildQuebrado = false) {
  const pasta = mkdtempSync(join(tmpdir(), 'hrzz-git-'));
  const remoto = join(pasta, 'remoto.git');
  const a = join(pasta, 'a');
  const b = join(pasta, 'b');
  execFileSync('git', ['init', '--bare', '-b', 'main', remoto]);
  execFileSync('git', ['clone', remoto, a], { stdio: 'ignore' });
  writeFileSync(join(a, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'node -e "0"' } }));
  git(a, 'add', '-A');
  git(a, 'commit', '-m', 'v1');
  git(a, 'push', '-u', 'origin', 'HEAD:main');
  execFileSync('git', ['clone', remoto, b], { stdio: 'ignore' });
  const publicar = () => {
    writeFileSync(join(b, 'novo.txt'), 'novo');
    if (buildQuebrado) writeFileSync(join(b, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'node -e "process.exit(3)"' } }));
    git(b, 'add', '-A');
    git(b, 'commit', '-m', 'v2');
    git(b, 'push');
  };
  return { pasta, a, publicar };
}

test('atualizar: ve mudancas novas, marca a versao, puxa e pede reinicio', async () => {
  const { pasta, a, publicar } = montar();
  const antes = await estadoGit(a, true);
  assert.equal(antes.repositorio, true);
  assert.equal(antes.atras, 0);
  assert.equal(antes.limpo, true);

  const semNovidade = await atualizar(a);
  assert.equal(semNovidade.ok, true);
  assert.equal(semNovidade.reiniciar, false);

  publicar();
  assert.equal((await estadoGit(a, true)).atras, 1);
  const r = await atualizar(a);
  assert.equal(r.ok, true, r.log.join('\n'));
  assert.equal(r.reiniciar, true);
  assert.match(r.tag ?? '', /^antes-\d{8}-\d{6}$/);
  assert.equal(git(a, 'log', '-1', '--format=%s'), 'v2');
  assert.deepEqual((await listarVersoes(a)).map((v) => v.tag), [r.tag]);
  rmSync(pasta, { recursive: true, force: true });
});

test('voltar versao: volta pra tag guardada e recusa tag inventada ou pasta suja', async () => {
  const { pasta, a, publicar } = montar();
  publicar();
  const r = await atualizar(a);
  assert.equal(r.ok, true, r.log.join('\n'));

  assert.equal((await voltarVersao(a, 'antes-inventada')).ok, false);
  appendFileSync(join(a, 'package.json'), ' ');
  const suja = await voltarVersao(a, r.tag!);
  assert.equal(suja.ok, false);
  assert.match(suja.log.join(' '), /mudanças não salvas/);
  git(a, 'checkout', '--', 'package.json');

  const v = await voltarVersao(a, r.tag!);
  assert.equal(v.ok, true, v.log.join('\n'));
  assert.equal(v.reiniciar, true);
  assert.equal(git(a, 'log', '-1', '--format=%s'), 'v1');
  // solto numa versao antiga: atualizar volta pro ramo principal e pega a versao nova de novo
  const de_novo = await atualizar(a);
  assert.equal(de_novo.ok, true, de_novo.log.join(' | '));
  assert.equal(git(a, 'log', '-1', '--format=%s'), 'v2');
  assert.equal(git(a, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
  rmSync(pasta, { recursive: true, force: true });
});

test('atualizar: se o build falha, volta pra versao anterior sozinho', async () => {
  const { pasta, a, publicar } = montar(true);
  publicar();
  const r = await atualizar(a);
  assert.equal(r.ok, false);
  assert.equal(r.reiniciar, false);
  assert.match(r.log.join('\n'), /falhou em: npm run build/);
  assert.equal(git(a, 'log', '-1', '--format=%s'), 'v1', 'voltou pra v1');
  rmSync(pasta, { recursive: true, force: true });
});

test('atualizar: pasta com mudancas nao salvas e recusada', async () => {
  const { pasta, a, publicar } = montar();
  publicar();
  appendFileSync(join(a, 'package.json'), ' ');
  const r = await atualizar(a);
  assert.equal(r.ok, false);
  assert.match(r.log[0], /mudanças não salvas/);
  rmSync(pasta, { recursive: true, force: true });
});
