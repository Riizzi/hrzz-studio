# Acesso e segurança

## Princípio

Os servidores do HRZZ escutam **só em `127.0.0.1`**. Ninguém de fora acessa direto. O acesso remoto passa por duas portas de entrada, cada uma com a sua proteção.

## 1. Direto na máquina

`http://localhost:7000` no navegador da própria máquina (PC, durante o desenvolvimento). **Pede PIN também**: decisão do João, porque no servidor dividido outras pessoas conseguem chegar no `localhost`.

## 2. Celular e notebook (Tailscale)

- O Tailscale cria uma rede privada só entre os aparelhos do João.
- No PC: instalar o Tailscale (`winget install Tailscale.Tailscale`), entrar na conta e rodar `tailscale serve` apontando pra `127.0.0.1:7000`. Confira a sintaxe com `tailscale serve --help`.
- No celular: app do Tailscale com a mesma conta. O endereço fica algo como `https://<nome-do-pc>.<tailnet>.ts.net`.
- **PIN:** pedido sempre que um aparelho novo abrir o HRZZ, depois lembrado por um tempo (proposta: 30 dias, cookie assinado).
- **PWA:** o HRZZ pode ser instalado como app no celular.

## 3. PC do trabalho (Cloudflare)

- `cloudflared` cria um túnel de saída do PC até a Cloudflare. Nenhuma porta é aberta no roteador.
- **Cloudflare Access** na frente: só passa quem digitar o código recebido no e-mail pessoal do João. Usar e-mail pessoal, não o institucional.
- **PIN do HRZZ** em seguida.
- **Endereço:** `https://studio.hrzztech.com`. Passo a passo em `tunel.md`. Por enquanto o túnel sai do PC de casa; depois, do servidor, com o mesmo endereço.
- **Terminal desligado nesse caminho.** O servidor reconhece pedidos vindos da Cloudflare pelos cabeçalhos que a borda sempre acrescenta (`Cf-Ray`, `Cf-Connecting-Ip`) e pelos do Access (`Cf-Access-Authenticated-User-Email`, `Cf-Access-Jwt-Assertion`). Assim o bloqueio vale mesmo se a regra do Access sumir. Ele bloqueia terminal e comandos de sistema. O chat pode editar arquivos dos projetos, mas não roda comando: o `claude` desse caminho sobe com `--restricted`.
- **Sessão curta:** 10 h no Access e 10 h no cookie do PIN (com `Secure`), só nesse caminho.
- **Rede do governo:** pode bloquear domínios novos. Se bloquear, não há muito o que fazer pelo lado do HRZZ.
- **Domínio:** `hrzztech.com`, comprado na Cloudflare.

## Servidor dividido com amigos

O HRZZ vai morar num servidor robusto dividido com amigos, cada um com os próprios projetos e ferramentas. Ainda não se sabe quem vai ter root. Então o HRZZ é feito pro pior caso: **qualquer pessoa no servidor pode tentar chegar nele**.

- **`127.0.0.1` não basta:** num servidor dividido, qualquer usuário da máquina acessa o `localhost`. Por isso o PIN vale em todo caminho, e toda rota da API e do WebSocket checa o cookie.
- **Isolamento (proposta P20, a confirmar):**
  - o HRZZ roda num container próprio, com usuário sem root, e os dados (`dados/`, logins do `claude` e do `agy`) num volume só dele;
  - o Tailscale roda dentro do container, ligado só à conta do João, então o HRZZ não depende do Tailscale da máquina, que pode ser de outra pessoa.
- **Portas configuráveis:** outras ferramentas dos amigos podem estar usando 7000, 7100 etc. Todas as portas saem de `config` e o instalador avisa se alguma estiver ocupada.
- **Segredos:** `dados/segredos/` com permissão só pro usuário do HRZZ (700). Mesmo assim, se alguém tiver root na máquina, consegue ler. Isso vai escrito no README pra não haver surpresa.
- **Assinaturas:** o Claude e o agy do João são só dele. Ninguém mais usa pelo HRZZ (regra da Anthropic e do bom senso).
- **Modo Yolo:** continua valendo, mas só dentro do container do HRZZ. Ele não alcança arquivos dos amigos.

## Link de pitch (preview pra mostrar a cliente)

- Gera um link temporário, só de leitura, de um preview específico. Vale 24 h, configurável.
- Passa pelo mesmo túnel da Cloudflare, numa rota pública só pra isso (`/p/<código-aleatório>`), sem acesso a mais nada do HRZZ.
- O editor e o rabisco não são injetados nessa rota.

## Segredos

- **Onde ficam:** em `dados/segredos/`, que nunca vai pro git nem pro backup.
- **Arquivos:**
  - `pin.json`: hash do PIN (scrypt ou argon2), nunca o PIN em texto;
  - `conectores.json`: estado de cada conector (ligado, acesso, token do serviço);
  - `mcp.json`: gerado a partir do anterior, no formato que o `claude` lê (`--mcp-config`); tem os tokens;
  - `conectores-detectados.json`: cópia da última lista do `claude mcp list` (sem segredos);
  - `sessao.key`: chave pra assinar cookies, gerada na primeira execução.
- **Login do Claude e do agy:** fica com os próprios programas. O HRZZ não toca (ver `02-ias.md`).

## Permissões da IA

Seguem os três modos escolhidos pelo João (Yolo, Mid, Intern), descritos em `02-ias.md`. Em qualquer modo, apagar e sair da pasta do projeto pedem confirmação, e pela Cloudflare não roda comando e nenhum conector vale (o `claude` sobe com `--strict-mcp-config`; mudar, testar e usar conector dá 403).
