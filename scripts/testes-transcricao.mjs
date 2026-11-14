// Testes da etapa 3 (transcricao) sem navegador: sobe o transcritor (modelo tiny) e um HRZZ isolado com o claude de mentira,
// e confere arquivo, YouTube, ao vivo, PIN, "mandar pro chat", /ata e galeria.
//   npm run testar:transcricao
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { falaDeTeste, subirServidorDeTeste, conversarPeloWs } from './lib-teste.mjs';

let falhas = 0;
function ok(nome, cond, detalhe = '') {
  if (cond) console.log(`  [ok] ${nome}`);
  else {
    console.log(`  [--] ${nome}${detalhe ? ': ' + detalhe : ''}`);
    falhas++;
  }
}
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const fala = falaDeTeste();
if (!fala) {
  console.log('sem voz sintetizada nesta maquina: testes de transcricao pulados');
  process.exit(0);
}

const servidor = await subirServidorDeTeste({ porta: 7094, transcritor: true, portaTranscritor: 7194 });
if (!servidor.transcritor) {
  console.log('o ambiente Python do transcritor nao existe (rode uv sync em servicos/transcritor): testes pulados');
  await servidor.parar();
  process.exit(0);
}
const tr = servidor.transcritor;
const h = { cookie: servidor.cabecalhoCookie };
const api = (caminho, init = {}) => fetch(servidor.url + caminho, { ...init, headers: { cookie: servidor.cabecalhoCookie, ...(init.headers ?? {}) } });
const json = async (caminho, init) => (await api(caminho, init)).json();

async function esperarTarefa(id, limiteMs = 120000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const lista = await json('/api/transcricao/tarefas');
    const t = lista.find((x) => x.id === id);
    if (t && ['pronta', 'erro', 'cancelada'].includes(t.status)) return t;
    await dorme(500);
  }
  return null;
}

try {
  console.log('transcricao: protecao');
  ok('sem o cookie do PIN: 401 em /api/transcricao/tarefas', (await fetch(servidor.url + '/api/transcricao/tarefas')).status === 401);
  ok('o transcritor recusa chamada sem a chave', (await fetch(tr.url + '/tarefas')).status === 401);
  ok('o transcritor aceita a chave', (await fetch(tr.url + '/tarefas', { headers: { 'x-hrzz-token': tr.token } })).status === 200);
  ok('rota fora da lista nao passa pelo servidor', (await api('/api/transcricao/')).status === 404);
  const estado = await json('/api/transcricao/estado');
  ok('estado: transcritor ligado, no processador ou na placa', estado.ligado === true && ['cpu', 'cuda'].includes(estado.saude?.dispositivo), JSON.stringify(estado));

  console.log('transcricao: arquivo');
  const audio = readFileSync(fala);
  const envio = await api('/api/transcricao/arquivo?nome=reuniao-teste.wav&idioma=pt&modelo=tiny', { method: 'POST', headers: { 'content-type': 'application/x-hrzz-midia' }, body: audio });
  const tarefa = await envio.json();
  ok('envio do arquivo cria a tarefa', envio.status === 200 && !!tarefa.id, JSON.stringify(tarefa));
  const pronta = await esperarTarefa(tarefa.id);
  ok('a tarefa termina', pronta?.status === 'pronta', JSON.stringify(pronta));
  const lista = await json('/api/transcricao/transcricoes');
  const t1 = lista.find((x) => x.id === pronta?.transcricao_id);
  ok('a transcricao aparece na lista com titulo, idioma e duracao', !!t1 && t1.titulo === 'reuniao-teste' && t1.idioma === 'pt' && t1.duracao > 20, JSON.stringify(t1));
  const txt = await (await api(`/api/transcricao/transcricoes/${t1.id}.txt`)).text();
  ok('o .txt tem o que foi dito', /bom dia/i.test(txt) && /decis/i.test(txt), txt.slice(0, 200));
  const srt = await (await api(`/api/transcricao/transcricoes/${t1.id}.srt`)).text();
  ok('o .srt tem numeracao e tempos', /^1\r?\n00:00:00,000 --> 00:00:\d\d,\d{3}\r?\n/.test(srt), srt.slice(0, 120));
  ok('os arquivos ficam em dados/transcricoes', existsSync(join(servidor.pasta, 'transcricoes', `${t1.id}.txt`)) && existsSync(join(servidor.pasta, 'transcricoes', `${t1.id}.json`)));
  ok('idioma invalido e recusado', (await api('/api/transcricao/arquivo?nome=a.wav&idioma=portugues', { method: 'POST', headers: { 'content-type': 'application/x-hrzz-midia' }, body: audio })).status === 400);
  ok('modelo desconhecido e recusado', (await api('/api/transcricao/arquivo?nome=a.wav&modelo=gigante', { method: 'POST', headers: { 'content-type': 'application/x-hrzz-midia' }, body: audio })).status === 400);

  console.log('transcricao: fila e cancelamento');
  const a = await (await api('/api/transcricao/arquivo?nome=fila-a.wav&idioma=pt&modelo=tiny', { method: 'POST', headers: { 'content-type': 'application/x-hrzz-midia' }, body: audio })).json();
  const b = await (await api('/api/transcricao/arquivo?nome=fila-b.wav&idioma=pt&modelo=tiny', { method: 'POST', headers: { 'content-type': 'application/x-hrzz-midia' }, body: audio })).json();
  const cancelada = await (await api(`/api/transcricao/tarefas/${b.id}/cancelar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  const ta = await esperarTarefa(a.id);
  const tb = await esperarTarefa(b.id, 30000);
  ok('a segunda tarefa da fila foi cancelada', cancelada.status === 'cancelada' || tb?.status === 'cancelada', JSON.stringify(tb));
  ok('a primeira terminou normalmente', ta?.status === 'pronta');

  console.log('transcricao: youtube');
  const yt = await (await api('/api/transcricao/youtube', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'isto nao e um link' }) })).status;
  ok('link sem https:// e recusado', yt === 400);
  const ruim = await (await api('/api/transcricao/youtube', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://exemplo.invalid/video', modelo: 'tiny' }) })).json();
  const tRuim = await esperarTarefa(ruim.id, 60000);
  ok('link que nao existe vira erro legivel na tarefa', tRuim?.status === 'erro' && /yt-dlp/i.test(tRuim.erro ?? ''), JSON.stringify(tRuim));
  // video curto de verdade (precisa de internet); se a rede ou o YouTube barrar, so avisa
  const bom = await (await api('/api/transcricao/youtube', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', modelo: 'tiny', idioma: 'en' }) })).json();
  const tBom = await esperarTarefa(bom.id, 180000);
  if (tBom?.status === 'pronta') {
    const m = (await json('/api/transcricao/transcricoes')).find((x) => x.id === tBom.transcricao_id);
    ok('youtube: baixa so o audio, transcreve e usa o titulo do video', m?.origem === 'youtube' && /rick astley/i.test(m.titulo) && m.duracao > 150, JSON.stringify(m));
  } else if (/não ouvi fala/.test(tBom?.erro ?? '')) {
    ok('youtube: baixou o audio e a tarefa mostrou o titulo do video (a musica nao teve fala reconhecida pelo tiny)', /rick astley/i.test(tBom.titulo), JSON.stringify(tBom));
  } else {
    console.log(`  [~~] youtube real nao testado (rede ou YouTube): ${tBom?.erro ?? tBom?.status}`);
  }

  console.log('transcricao: ao vivo (microfone do navegador, webm/opus em pedacos)');
  const webm = join(tmpdir(), 'hrzz-fala-pt.webm');
  const conv = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fala, '-c:a', 'libopus', '-b:a', '32k', '-f', 'webm', webm], { encoding: 'utf8' });
  ok('ffmpeg gerou o webm de teste', conv.status === 0 && existsSync(webm), conv.stderr);
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket(servidor.url.replace('http', 'ws') + '/api/transcricao/ao-vivo?fonte=microfone&idioma=pt&modelo=tiny', { headers: { cookie: servidor.cabecalhoCookie } });
  const msgs = [];
  const fim = new Promise((res) => {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      msgs.push(m);
      if (m.tipo === 'fim') res(m);
    });
    ws.on('close', () => res(null));
  });
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  const dados = readFileSync(webm);
  // espera o modelo ficar pronto, como a interface faz, e manda em pedacos de ~1 s
  for (let i = 0; i < 100 && !msgs.some((m) => m.tipo === 'pronto'); i++) await dorme(100);
  ok('o servico avisa que o modelo carregou', msgs.some((m) => m.tipo === 'pronto'));
  for (let i = 0; i < dados.length; i += 6000) {
    ws.send(dados.subarray(i, i + 6000));
    await dorme(120);
  }
  ws.send('parar');
  const resultadoVivo = await Promise.race([fim, dorme(120000).then(() => null)]);
  const textos = msgs.filter((m) => m.tipo === 'texto');
  ok('chega texto parcial em varias janelas', textos.length >= 3, `${textos.length} janelas`);
  ok('as janelas nao repetem a emenda (sem trecho duplicado seguido)', !textos.some((m, i) => i > 0 && m.texto.length > 12 && textos[i - 1].texto.endsWith(m.texto)));
  ok('o fim traz o id da transcricao salva', !!resultadoVivo?.id, JSON.stringify(resultadoVivo));
  const vivo = (await json('/api/transcricao/transcricoes')).find((x) => x.id === resultadoVivo?.id);
  ok('a transcricao ao vivo foi salva com origem "ao-vivo" e audio gravado', vivo?.origem === 'ao-vivo' && vivo.audioGravado === true, JSON.stringify(vivo));
  const refaz = await api(`/api/transcricao/transcricoes/${vivo?.id}/refazer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelo: 'tiny' }) });
  const tRefaz = await refaz.json();
  const fRefaz = await esperarTarefa(tRefaz.id, 120000);
  ok('"refazer com o modelo grande" roda no audio gravado e troca o modelo', fRefaz?.status === 'pronta' && (await json('/api/transcricao/transcricoes')).find((x) => x.id === vivo.id)?.refeita === true, JSON.stringify(fRefaz));

  console.log('transcricao: chat, /ata e galeria');
  const paraChat = await api(`/api/transcricao/transcricoes/${t1.id}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const pc = await paraChat.json();
  ok('mandar pro chat devolve o anexo (copia do .txt) e 3 sugestoes', paraChat.status === 200 && existsSync(pc.anexo?.caminho) && pc.sugestoes?.length === 3, JSON.stringify(pc).slice(0, 200));
  ok('o anexo fica na pasta de anexos (que o claude enxerga)', pc.anexo.caminho.includes(join(servidor.pasta, 'anexos')));
  ok('transcricao inexistente da 404', (await api('/api/transcricao/transcricoes/nao-existe/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 404);

  const fimAta = await conversarPeloWs(servidor, { texto: '/ata foco nas decisoes' });
  const dadosConversa = await json(`/api/conversas/${fimAta.conversa}`);
  const primeira = dadosConversa.mensagens.find((m) => m.papel === 'eu')?.conteudo;
  ok('/ata vira o pedido de ata com a ultima transcricao anexada', /ata da reuni/i.test(primeira?.texto ?? '') && /foco nas decisoes/.test(primeira.texto) && primeira.anexos?.length === 1, JSON.stringify(primeira).slice(0, 200));
  ok('o anexo do /ata e o texto da ultima transcricao', /\.txt$/.test(primeira?.anexos?.[0]?.nome ?? '') && readFileSync(primeira.anexos[0].caminho, 'utf8').length > 50);

  const galeria = await json('/api/galeria?atualizar=1');
  const g = galeria.filter((x) => x.raiz === 't');
  ok('a galeria lista as transcricoes (so os .txt, com o titulo)', g.length >= 2 && g.every((x) => x.caminho.endsWith('.txt')) && g.some((x) => x.nome === 'reuniao-teste'), JSON.stringify(g.map((x) => x.nome)));
  const baixado = await api(`/api/arquivos/baixar?raiz=t&caminho=${encodeURIComponent(g[0].caminho)}`);
  ok('o arquivo da galeria abre pela raiz "t"', baixado.status === 200 && (await baixado.text()).length > 20);

  console.log('transcricao: apagar');
  const del = await api(`/api/transcricao/transcricoes/${t1.id}`, { method: 'DELETE' });
  ok('apagar remove os 3 arquivos', del.status === 200 && !existsSync(join(servidor.pasta, 'transcricoes', `${t1.id}.txt`)) && !existsSync(join(servidor.pasta, 'transcricoes', `${t1.id}.json`)) && !existsSync(join(servidor.pasta, 'transcricoes', `${t1.id}.srt`)));
} catch (e) {
  console.log('  [--] erro inesperado:', e.stack ?? e, e.cause ?? '');
  console.log('  ultimas linhas do transcritor:', tr.saida().split('\n').slice(-15).join('\n'));
  falhas++;
} finally {
  await servidor.parar();
}

console.log(falhas === 0 ? '\ntodos os testes de transcricao passaram' : `\n${falhas} falha(s) na transcricao`);
process.exit(falhas === 0 ? 0 : 1);
