# Acesso e segurança

## Princípio

Os servidores do HRZZ escutam **só em `127.0.0.1`**. Ninguém de fora acessa direto. O acesso remoto passa por duas portas de entrada, cada uma com a sua proteção.

## 1. Em casa

`http://localhost:7000` no navegador do PC. Sem PIN.

## 2. Celular e notebook (Tailscale)

- O Tailscale cria uma rede privada só entre os aparelhos do João.
- No PC: instalar o Tailscale (`winget install Tailscale.Tailscale`), entrar na conta e rodar `tailscale serve` apontando pra `127.0.0.1:7000`. Confira a sintaxe com `tailscale serve --help`.
- No celular: app do Tailscale com a mesma conta. O endereço fica algo como `https://<nome-do-pc>.<tailnet>.ts.net`.
- **PIN:** pedido na primeira abertura de cada aparelho novo, depois lembrado por 30 dias (cookie assinado).
- **PWA:** o HRZZ pode ser instalado como app no celular.

## 3. PC do trabalho (Cloudflare)

- `cloudflared` cria um túnel de saída do PC até a Cloudflare. Nenhuma porta é aberta no roteador.
- **Cloudflare Access** na frente: só passa quem digitar o código recebido no e-mail pessoal do João. Usar e-mail pessoal, não o institucional.
- **PIN do HRZZ** em seguida.
- **Terminal desligado nesse caminho.** O servidor reconhece pedidos vindos da Cloudflare pelo cabeçalho `Cf-Access-Authenticated-User-Email` e bloqueia terminal e comandos de sistema. O chat pode editar arquivos dos projetos, mas não roda comando: o `claude` desse caminho sobe com `--restricted`.
- **Sessão curta:** 8 h.
- **Rede do governo:** pode bloquear domínios novos. Se bloquear, não há muito o que fazer pelo lado do HRZZ.
- Precisa de um domínio na Cloudflare. Um `.com` barato serve; ou o domínio pode já existir. Decidir na etapa 7.

## Link de pitch (preview pra mostrar a cliente)

- Gera um link temporário, só de leitura, de um preview específico. Vale 24 h, configurável.
- Passa pelo mesmo túnel da Cloudflare, numa rota pública só pra isso (`/p/<código-aleatório>`), sem acesso a mais nada do HRZZ.
- O editor e o rabisco não são injetados nessa rota.

## Segredos

- **Onde ficam:** em `dados/segredos/`, que nunca vai pro git nem pro backup.
- **Arquivos:**
  - `pin.json`: hash do PIN (scrypt ou argon2), nunca o PIN em texto;
  - `mcp.json`: configuração dos conectores, que podem ter tokens;
  - `sessao.key`: chave pra assinar cookies, gerada na primeira execução.
- **Login do Claude e do agy:** fica com os próprios programas. O HRZZ não toca (ver `02-ias.md`).

## Permissões da IA

Seguem os três modos escolhidos pelo João (Yolo, Mid, Intern), descritos em `02-ias.md`. Em qualquer modo, apagar e sair da pasta do projeto pedem confirmação, e pela Cloudflare não roda comando.
