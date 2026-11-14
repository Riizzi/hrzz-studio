// Teste com o claude de verdade (Haiku, uma conversa curta): confere que uma ferramenta de conector que ainda
// nao foi liberada vira cartao de permissao (categoria "conector") e que, liberada, o claude chega a usar o conector.
// Precisa de um conector da conta ligado (ex.: Google Drive no claude.ai). Gasta poucas mensagens.
//   npm run testar:conectores-real
import { conversarPeloWs, subirServidorDeTeste } from './lib-teste.mjs';

const servidor = await subirServidorDeTeste({ porta: 7095, claudeReal: true });
const api = (caminho, init = {}) => fetch(servidor.url + caminho, { ...init, headers: { cookie: servidor.cabecalhoCookie, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
let falhas = 0;
const ok = (nome, cond, detalhe = '') => {
  console.log(`  [${cond ? 'ok' : '--'}] ${nome}${cond || !detalhe ? '' : ': ' + detalhe}`);
  if (!cond) falhas++;
};
try {
  const det = await (await api('/api/conectores/detectar', { method: 'POST', body: '{}' })).json();
  const drive = det.conectores.find((c) => c.id === 'google-drive');
  console.log('google drive no claude:', drive.status, drive.servidor ?? '');
  if (drive.status !== 'conectado') {
    console.log('  [~~] sem o Google Drive conectado no claude: teste pulado');
  } else {
    const pedido = 'Use a ferramenta de busca de arquivos do Google Drive para listar 1 arquivo qualquer. Só chame a ferramenta e diga o nome do arquivo.';
    const r = await conversarPeloWs(servidor, { texto: pedido, modelo: 'haiku', modo: 'mid' }, { limiteMs: 150000 });
    const conv = await (await api(`/api/conversas/${r.conversa}`)).json();
    const blocos = conv.mensagens.filter((m) => m.papel === 'ia').flatMap((m) => m.conteudo);
    const cartao = blocos.find((b) => b.tipo === 'permissao');
    console.log('blocos:', blocos.map((b) => b.tipo + (b.tipo === 'ferramenta' ? ':' + b.nome : '')).join(', '));
    ok('"pergunta antes": a ferramenta do Drive vira cartao de permissao', !!cartao && cartao.negadas.some((n) => n.categoria === 'conector'), JSON.stringify(cartao?.negadas));
    const regra = cartao?.negadas.find((n) => n.categoria === 'conector')?.regra;
    ok('a regra liberada e o servidor inteiro (mcp__claude_ai_Google_Drive)', regra === 'mcp__claude_ai_Google_Drive', regra);

    await api('/api/conectores/google-drive', { method: 'PUT', body: JSON.stringify({ acesso: 'livre' }) });
    const r2 = await conversarPeloWs(servidor, { texto: pedido, modelo: 'haiku', modo: 'mid', conversa: undefined }, { limiteMs: 150000 });
    const conv2 = await (await api(`/api/conversas/${r2.conversa}`)).json();
    const blocos2 = conv2.mensagens.filter((m) => m.papel === 'ia').flatMap((m) => m.conteudo);
    console.log('blocos (livre):', blocos2.map((b) => b.tipo + (b.tipo === 'ferramenta' ? ':' + b.nome : '')).join(', '));
    ok('"livre": nao pede permissao e o claude chama a ferramenta do Drive', !blocos2.some((b) => b.tipo === 'permissao') && blocos2.some((b) => b.tipo === 'ferramenta' && /Drive|drive/.test(b.nome)), JSON.stringify(blocos2).slice(0, 400));
  }
} finally {
  await servidor.parar();
}
console.log(falhas === 0 ? '\ntudo certo' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
