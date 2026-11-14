// Skills: as que o Claude Code ja enxerga (pasta de skills do usuario e plugins sincronizados) e as do Joao
// criadas no HRZZ (dados/skills). Ligar ou desligar vale por projeto:
//  - as do HRZZ entram num plugin gerado so com as ligadas (--plugin-dir), nome nativo "hrzz-skills:<nome>";
//  - as que o claude ja carrega sozinho ganham uma regra Skill(<nome>) em --disallowedTools quando desligadas.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLUGIN_HRZZ = 'hrzz-skills';

export type SkillInfo = {
  chave: string; // nome nativo no claude, ex.: anthropic-skills:docx
  nome: string;
  descricao: string;
  origem: 'sua' | 'anthropic';
  editavel: boolean; // so as criadas no HRZZ (dados/skills)
  caminho: string; // pasta da skill
};

export function nomeSkillValido(nome: unknown): nome is string {
  return typeof nome === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(nome);
}

// le o cabecalho "---" do SKILL.md (so chave: valor, com aspas e blocos "> |" simples)
export function lerCabecalho(texto: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto.replace(/^﻿/, ''));
  const saida: Record<string, string> = {};
  if (!m) return saida;
  const linhas = m[1].split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const l = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(linhas[i]);
    if (!l) continue;
    let valor = l[2].trim();
    if (/^[>|][+-]?$/.test(valor)) {
      const bloco: string[] = [];
      while (i + 1 < linhas.length && /^\s+\S/.test(linhas[i + 1])) bloco.push(linhas[++i].trim());
      valor = bloco.join(' ');
    }
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    saida[l[1]] = valor;
  }
  return saida;
}

function lerSkill(pasta: string, nomePadrao: string): { nome: string; descricao: string } | null {
  const arq = join(pasta, 'SKILL.md');
  if (!existsSync(arq)) return null;
  try {
    const c = lerCabecalho(readFileSync(arq, 'utf8'));
    const descricao = (c.description ?? '').replace(/\s+/g, ' ').trim();
    return { nome: c.name || nomePadrao, descricao: descricao.length > 240 ? descricao.slice(0, 239) + '…' : descricao };
  } catch {
    return null;
  }
}

function subpastas(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// Acha todas as skills conhecidas. claudeHome e a pasta .claude do usuario (padrao ~/.claude).
export function descobrirSkills(pastaSkillsHrzz: string, claudeHome: string): SkillInfo[] {
  const lista = new Map<string, SkillInfo>();
  const somar = (s: SkillInfo) => {
    if (!lista.has(s.chave)) lista.set(s.chave, s);
  };

  // 1. as do Joao criadas no HRZZ
  for (const n of subpastas(pastaSkillsHrzz)) {
    const i = lerSkill(join(pastaSkillsHrzz, n), n);
    if (i) somar({ chave: `${PLUGIN_HRZZ}:${n}`, nome: n, descricao: i.descricao, origem: 'sua', editavel: true, caminho: join(pastaSkillsHrzz, n) });
  }

  // 2. skills soltas do usuario: ~/.claude/skills/<nome>/SKILL.md (o nome nativo e so o nome)
  const raizSkills = join(claudeHome, 'skills');
  for (const n of subpastas(raizSkills)) {
    const i = lerSkill(join(raizSkills, n), n);
    if (i) somar({ chave: i.nome, nome: i.nome, descricao: i.descricao, origem: 'sua', editavel: false, caminho: join(raizSkills, n) });
  }

  // 3. skills sincronizadas do claude.ai: ~/.claude/skills/synced/<id>/<nome>/SKILL.md (nome nativo anthropic-skills:<nome>)
  const sincronizadas = join(raizSkills, 'synced');
  for (const id of subpastas(sincronizadas)) {
    const base = join(sincronizadas, id);
    const fontes = new Map<string, string>();
    try {
      const m = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8')) as { skills?: { name?: string; source?: string }[] };
      for (const s of m.skills ?? []) if (s.name && s.source) fontes.set(s.name, s.source);
    } catch {
      /* sem manifest: tudo vira "sua" */
    }
    for (const n of subpastas(base)) {
      const i = lerSkill(join(base, n), n);
      if (!i) continue;
      const fonte = fontes.get(i.nome) ?? fontes.get(n) ?? '';
      somar({ chave: `anthropic-skills:${i.nome}`, nome: i.nome, descricao: i.descricao, origem: fonte.startsWith('anthropic') ? 'anthropic' : 'sua', editavel: false, caminho: join(base, n) });
    }
  }

  // 4. plugins sincronizados: ~/.claude/plugins/synced/<balde>/<id>/ com .claude-plugin/plugin.json
  const plugins = join(claudeHome, 'plugins', 'synced');
  for (const balde of subpastas(plugins)) {
    for (const id of subpastas(join(plugins, balde))) {
      const raiz = join(plugins, balde, id);
      let plugin = '';
      try {
        plugin = String((JSON.parse(readFileSync(join(raiz, '.claude-plugin', 'plugin.json'), 'utf8')) as { name?: string }).name ?? '');
      } catch {
        continue;
      }
      if (!plugin) continue;
      const unica = lerSkill(raiz, plugin);
      if (unica) somar({ chave: `${plugin}:${unica.nome}`, nome: unica.nome, descricao: unica.descricao, origem: 'sua', editavel: false, caminho: raiz });
      for (const n of subpastas(join(raiz, 'skills'))) {
        const i = lerSkill(join(raiz, 'skills', n), n);
        if (i) somar({ chave: `${plugin}:${i.nome}`, nome: i.nome, descricao: i.descricao, origem: 'sua', editavel: false, caminho: join(raiz, 'skills', n) });
      }
    }
  }

  return [...lista.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---------- skills criadas no HRZZ ----------
export function lerSkillHrzz(pasta: string, nome: string): { nome: string; descricao: string; instrucoes: string } | null {
  if (!nomeSkillValido(nome)) return null;
  const arq = join(pasta, nome, 'SKILL.md');
  if (!existsSync(arq)) return null;
  const texto = readFileSync(arq, 'utf8');
  const c = lerCabecalho(texto);
  const corpo = texto.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  return { nome, descricao: c.description ?? '', instrucoes: corpo };
}

export function gravarSkillHrzz(pasta: string, nome: string, descricao: string, instrucoes: string): void {
  if (!nomeSkillValido(nome)) throw new Error('nome inválido: use letras minúsculas, números e -');
  const desc = descricao.replace(/\s+/g, ' ').trim();
  if (!desc) throw new Error('escreva quando a skill deve ser usada (descrição)');
  if (!instrucoes.trim()) throw new Error('escreva as instruções da skill');
  if (Buffer.byteLength(instrucoes) > 200 * 1024) throw new Error('as instruções passam de 200 KB');
  const dir = join(pasta, nome);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${nome}\ndescription: ${JSON.stringify(desc)}\n---\n\n${instrucoes.trim()}\n`);
}

export function apagarSkillHrzz(pasta: string, nome: string): boolean {
  if (!nomeSkillValido(nome) || !existsSync(join(pasta, nome, 'SKILL.md'))) return false;
  rmSync(join(pasta, nome), { recursive: true, force: true });
  return true;
}

// ---------- o que vai pro claude em cada turno ----------
function assinaturaPasta(dir: string, prefixo = ''): string {
  const partes: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const c = join(dir, e.name);
    if (e.isDirectory()) partes.push(assinaturaPasta(c, `${prefixo}${e.name}/`));
    else {
      const st = statSync(c);
      partes.push(`${prefixo}${e.name}:${st.size}:${Math.round(st.mtimeMs)}`);
    }
  }
  return partes.join('|');
}

// Monta (ou atualiza) o plugin com as skills do HRZZ que estao ligadas neste escopo e devolve a pasta.
// Sem nenhuma ligada, devolve undefined. So reescreve quando algo mudou.
export function prepararPluginSkills(pastaSkills: string, pastaPlugins: string, escopo: string, desligadas: string[]): string | undefined {
  const ligadas = subpastas(pastaSkills).filter((n) => nomeSkillValido(n) && existsSync(join(pastaSkills, n, 'SKILL.md')) && !desligadas.includes(`${PLUGIN_HRZZ}:${n}`));
  const destino = join(pastaPlugins, escopo);
  if (ligadas.length === 0) {
    if (existsSync(destino)) rmSync(destino, { recursive: true, force: true });
    return undefined;
  }
  const assinatura = ligadas.map((n) => `${n}=${assinaturaPasta(join(pastaSkills, n))}`).join('\n');
  const marca = join(destino, '.assinatura');
  try {
    if (existsSync(marca) && readFileSync(marca, 'utf8') === assinatura) return destino;
  } catch {
    /* refaz */
  }
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(join(destino, '.claude-plugin'), { recursive: true });
  writeFileSync(join(destino, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: PLUGIN_HRZZ, version: '0.0.1', description: 'skills do João no HRZZ' }));
  for (const n of ligadas) cpSync(join(pastaSkills, n), join(destino, 'skills', n), { recursive: true });
  writeFileSync(marca, assinatura);
  return destino;
}

// regras --disallowedTools das skills desligadas
export function regrasSkillsDesligadas(desligadas: string[]): string[] {
  return desligadas.map((c) => `Skill(${c})`);
}
