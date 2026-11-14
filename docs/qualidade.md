# Teste de qualidade: HRZZ x claude.ai (etapa 1)

Gerado por `npm run qualidade` em 13/11/2026, 21:07:04.
Modelo no HRZZ: **sonnet**. Uso da janela de 5 h ao fim: 58%.

## Como usar

1. Abra uma conversa nova no claude.ai com o mesmo modelo e rode cada pergunta abaixo (a 7 precisa do arquivo anexo; a 10 é uma conversa de 5 mensagens seguidas).
2. Cole a resposta do claude.ai na seção "claude.ai" de cada item.
3. Peça pro Claude Code: "compare as respostas do docs/qualidade.md" (ele compara correção, completude, tom, formato e tempo e propõe ajustes nas instruções de fundo).

O arquivo anexo da pergunta 7 fica em `dados/qualidade/relatorio-trimestral.txt`.

---

## 1. texto no meu estilo

**Pergunta:** Escreva um e-mail curto pro meu chefe pedindo pra adiar a reunião de quinta pra sexta de manhã, por causa de um compromisso na UFMG. Tom profissional, mas direto.

**HRZZ** (10 s, modelo sonnet):

(pensou por 1 s)

(ferramenta: Skill anthropic-skills:estilo-joao-pedro)

(pensou por 4 s)

**Assunto:** Pedido de remarcação da reunião de quinta para sexta de manhã

Olá, [nome],

Gostaria de pedir a remarcação da reunião de quinta-feira ([data]) para sexta-feira ([data]) pela manhã, no horário que ficar melhor pra você, visto que tenho um compromisso na UFMG que coincide com o horário previsto.

Também posso adiantar por e-mail os pontos que precisarem ser alinhados, de modo a não atrasar [assunto da reunião]. Caso sexta de manhã não seja possível, me avise que ajusto minha agenda.

Atenciosamente,
João Pedro

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 2. ajuste num site de loja

**Pergunta:** No index.html, troque o texto do botão "Comprar" por "Adicionar ao carrinho" e deixe o botão com pelo menos 44 px de altura.

**HRZZ** (9 s, modelo sonnet):

(ferramenta: Grep Comprar)

(pensou por 1 s)

(ferramenta: Read C:\Users\jpriz\AppData\Local\Temp\hrzz-qualidade-OZzs0s\site-loja\index.html)

(ferramenta: Edit C:\Users\jpriz\AppData\Local\Temp\hrzz-qualidade-OZzs0s\site-loja\index.html)

(ferramenta: Edit C:\Users\jpriz\AppData\Local\Temp\hrzz-qualidade-OZzs0s\site-loja\index.html)

Pronto, no `index.html`:

- O botão agora diz "Adicionar ao carrinho".
- Ele tem `min-height:44px`, então nunca fica menor que 44 px.
- Aumentei o padding lateral de 10 px para 16 px, porque o texto novo é mais longo e ficava apertado.

Não abri a página no navegador para conferir.

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 3. planilha com fórmulas

**Pergunta:** Monte uma planilha de controle de gastos mensais com colunas data, categoria, descrição e valor, mais uma aba de resumo com o total por categoria (fórmulas, não valores fixos) e o saldo do mês dado um salário de R$ 5.000. Salve como gastos.xlsx.

**HRZZ** (87 s, modelo sonnet):

(pensou por 1 s)

(ferramenta: Skill anthropic-skills:xlsx)

(pensou por 5 s)

(ferramenta: Write C:\Users\jpriz\AppData\Local\Temp\hrzz-build\build.py)

(pensou por 3 s)

Não consegui gravar o script fora da pasta do projeto, porque o ambiente não tem como aprovar isso. Vou rodar o Python direto da pasta do projeto, sem criar arquivo auxiliar.

(ferramenta: Bash python - <<'EOF' from datetime import date from openpyxl import Workbook from openpyxl.st…)

(pensou por 1 s)

(ferramenta: Bash which -a python python3 py 2>/dev/null; python --version; python -m pip install openpyxl …)

Instalou. Agora gero a planilha.

(ferramenta: Bash python - <<'EOF' from datetime import date from openpyxl import Workbook from openpyxl.st…)

(pensou por 2 s)

(ferramenta: Bash which soffice libreoffice 2>/dev/null; ls "/c/Program Files/LibreOffice/program/soffice.e…)

(pensou por 1 s)

Não tem LibreOffice nesta máquina, então não dá para recalcular. Vou conferir as fórmulas lendo o arquivo e calculando os resultados esperados à mão.

(ferramenta: Bash python - <<'EOF' from openpyxl import load_workbook wb = load_workbook("gastos.xlsx") pri…)

(ferramenta: Bash PYTHONIOENCODING=utf-8 python - <<'EOF' from openpyxl import load_workbook wb = load_work…)

Criei o `gastos.xlsx` na pasta do projeto, com as fórmulas conferidas só por leitura. Não consegui recalcular no LibreOffice porque ele não está instalado nesta máquina. As fórmulas só ganham valor quando você abrir no Excel. Pelas contas que fiz fora da planilha, os exemplos dão R$ 2.386,25 de gastos e saldo de R$ 2.613,75.

**Aba Gastos**
- As colunas são Data, Categoria, Descrição e Valor.
- A Categoria é uma lista de escolha, que vem da aba Resumo.
- A tabela já está formatada até a linha 500.
- Deixei 6 linhas de exemplo (aluguel, supermercado e outras) para você ver o formato. Pode apagar ou sobrescrever.

**Aba Resumo**
- **Salário:** R$ 5.000 numa célula amarela (B3). Se mudar, tudo recalcula.
- **Total por categoria:** o total de cada categoria e a porcentagem do salário. São todas fórmulas (`SUMIF`). As categorias são Moradia, Alimentação, Transporte, Lazer, Saúde, Educação e Outros, e você pode trocar os nomes.
- **Sem categoria:** mostra qualquer gasto cuja categoria ficou vazia ou fora da lista, para nenhum valor sumir do total.
- **Saldo do mês:** salário menos o total geral de gastos, com um aviso se passar do salário.

(pediu permissao: mexer fora da pasta do projeto: C:\Users\jpriz\AppData\Local\Temp\hrzz-build\build.py)

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 4. pesquisa na web

**Pergunta:** Qual é a versão LTS mais recente do Node.js hoje e até quando ela recebe suporte? Pesquise na web e cite a fonte.

**HRZZ** (12 s, modelo sonnet):

(pensou por 1 s)

(ferramenta: ToolSearch select:WebSearch)

(ferramenta: WebSearch Node.js latest LTS release schedule end of life)

(pensou por 6 s)

Não consegui pesquisar na web. A ferramenta de busca pediu aprovação, e esta sessão não tem como aprovar, então o sistema negou. Por isso não tenho fonte para citar, e prefiro não passar de cabeça como se fosse confirmado.

O que eu lembro do calendário oficial, sem verificação de hoje:
- **Node.js 24** virou LTS em outubro de 2025. Entra em manutenção por volta de outubro de 2026 e chega ao fim de vida em abril de 2028.
- **Node.js 26** deveria ter saído em abril de 2026. Pelo ciclo normal, viraria LTS em outubro de 2026, o que o tornaria a LTS mais recente hoje (13/11/2026). Isso é só inferência do calendário, não confirmei.

Para ter a resposta certa com fonte, abra a página oficial de releases: https://nodejs.org/en/about/previous-releases. A tabela mostra o status de cada versão, com as datas de início do LTS e de fim de vida. Se você liberar a permissão de busca na web, eu refaço a pesquisa e cito a fonte.

(pediu permissao: usar WebSearch)

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 5. análise com pensamento profundo

**Pergunta:** Analise os prós e contras de migrar uma loja pequena de WordPress para Astro com hospedagem na Vercel, considerando custo, manutenção por quem não é desenvolvedor e SEO. Termine com uma recomendação clara e o que faria primeiro.

**HRZZ** (121 s, modelo sonnet):

(pensou por 19 s)

Vou conferir os preços e as regras atuais antes de responder, porque plano e termos da Vercel mudam bastante.

(ferramenta: ToolSearch select:WebSearch)

(pensou por 2 s)

(ferramenta: WebSearch Vercel Hobby plan commercial use not allowed Pro plan price per month fair use)

(ferramenta: WebSearch Astro web framework latest version 2026 Cloudflare Astro Technology Company)

(ferramenta: WebSearch Astro headless CMS non-technical editors Keystatic Decap Sanity Storyblok visual editing …)

(ferramenta: WebSearch migrate WordPress WooCommerce to static site Astro SEO 301 redirects ranking loss)

(pensou por 90 s)

Queria conferir preços e termos atuais da Vercel na web, mas a busca foi bloqueada nesta sessão. Os valores abaixo são de memória, então confirme na página de preços antes de decidir.

Assumi uma loja que vende online, com WooCommerce, carrinho e checkout. Isso pesa mais que qualquer outro ponto, porque o Astro monta o site mas não é loja. Carrinho, estoque e pagamento teriam que vir de outro serviço.

**Custo**
- A favor: site estático gasta quase nada de servidor, e você larga tema e plugins pagos.
- Contra: a Vercel funciona bem com Astro, mas o plano grátis (Hobby) é só para uso não comercial. Loja é comercial, então seria o Pro, cerca de US$ 20/mês por usuário, cobrado em dólar. Costuma sair mais caro que uma hospedagem compartilhada de WordPress.
- Contra: se o checkout ficar no WooCommerce, você paga os dois lados. Se for para Shopify, Snipcart ou parecido, entra mensalidade e taxa por venda.
- Contra: o maior custo são as horas da migração: tema refeito, conteúdo e redirecionamentos.

**Manutenção por quem não é dev**
- A favor: não tem PHP, banco nem plugin para atualizar, e quase nada para ser invadido. Um site estático fica meses sem mexer.
- Contra: não existe wp-admin. Sem CMS, o dono não troca nem uma foto. Com CMS (Keystatic ou Decap, grátis; Sanity ou Storyblok, com plano grátis limitado) ele edita texto, foto e preço. Mudar layout continua dependendo de dev.
- Contra: num site estático, cada edição dispara um build e leva de um a poucos minutos para aparecer. Se o deploy quebrar, só dev resolve, e quem montou o site vira ponto único de falha.

**SEO**
- A favor: o HTML sai limpo e quase sem JavaScript, então o Core Web Vitals fica ótimo com pouco esforço. Você também controla title, schema e sitemap com precisão.
- Contra: a migração é o risco. URL que muda sem 301, meta description perdida, schema de produto que some ou canonical errado derrubam o tráfego. Mesmo bem feita, pode haver queda por algumas semanas. O Yoast/Rank Math também some, então os campos de SEO precisam ser recriados no CMS.
- Se o WordPress atual já é razoavelmente rápido, o ganho de ranking é pequeno. Ranking vem de conteúdo e links, não da tecnologia do site.

**Recomendação**

Se tem checkout no WooCommerce, não migre. Se o incômodo é lentidão ou segurança, resolva no WordPress: hospedagem melhor, cache, tirar plugin pesado, tema leve. Custa menos e não arrisca o SEO.

Se é só vitrine ou catálogo, com pedido por WhatsApp ou link de pagamento, migre para Astro com um CMS simples. Eu hospedaria na Cloudflare Pages ou Netlify, cujos planos grátis costumam aceitar uso comercial (confirme nos termos). A Vercel Pro só entra se o cliente já pagar por ela.

**O que eu faria primeiro**
1. Auditar o WordPress atual, em um dia. Liste os plugins e o que cada um faz, o custo mensal real e a nota no Core Web Vitals (Search Console ou PageSpeed). Veja também quem edita o quê e com que frequência. Isso mostra se existe motivo para migrar.
2. Exportar do Search Console e do Analytics as URLs com tráfego. Elas viram a lista de redirecionamentos 301 e o checklist de metadados, que é o que protege o SEO.
3. Fazer um piloto com uma página ou o blog em Astro, num subdomínio de teste e com o CMS escolhido. Peça ao dono para trocar um preço e uma foto sozinho. Se ele não conseguir, a migração não fecha. O WordPress segue no ar até o novo ser aprovado.

(pediu permissao: usar WebSearch)

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 6. código em PowerShell

**Pergunta:** Escreva um script PowerShell 5 (sem usar &&) que renomeie todos os arquivos .jpeg de uma pasta pra .jpg, mostre quantos foram renomeados e não sobrescreva arquivos que já existam.

**HRZZ** (14 s, modelo sonnet):

(pensou por 5 s)

```powershell
param(
    [string]$Pasta = "."
)

$renomeados = 0
$pulados    = 0
$erros      = 0

$arquivos = Get-ChildItem -LiteralPath $Pasta -File |
    Where-Object { $_.Extension -ieq '.jpeg' }

foreach ($arq in $arquivos) {
    $novoNome = $arq.BaseName + '.jpg'
    $destino  = Join-Path $arq.DirectoryName $novoNome

    if (Test-Path -LiteralPath $destino) {
        Write-Host "Pulado (já existe): $novoNome" -ForegroundColor Yellow
        $pulados++
        continue
    }

    try {
        Rename-Item -LiteralPath $arq.FullName -NewName $novoNome -ErrorAction Stop
        $renomeados++
    }
    catch {
        Write-Host "Erro em $($arq.Name): $($_.Exception.Message)" -ForegroundColor Red
        $erros++
    }
}

Write-Host ""
Write-Host "Renomeados: $renomeados"
Write-Host "Pulados (destino já existia): $pulados"
if ($erros -gt 0) { Write-Host "Erros: $erros" -ForegroundColor Red }
```

**Como usar:** salve como `renomear-jpeg.ps1` e rode `.\renomear-jpeg.ps1 -Pasta "C:\Fotos"`. Sem o parâmetro, ele usa a pasta atual.

- Pega `.jpeg`, `.JPEG` e variações de maiúscula/minúscula. Não entra em subpastas.
- Se já existir um `.jpg` com o mesmo nome, o arquivo é pulado e avisado, então nada é sobrescrito.
- Usa `-LiteralPath`, então nomes com colchetes `[ ]` não dão problema.
- Se der erro de política de execução, rode antes `Set-ExecutionPolicy -Scope Process Bypass`.

Não testei rodando. Se quiser, eu salvo o arquivo aqui e faço um teste numa pasta temporária.

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 7. resumo de documento anexado

**Pergunta:** Resuma esse relatório em 5 linhas pra eu levar numa reunião e destaque o que preciso decidir.

**HRZZ** (12 s, modelo sonnet; anexo enviado pelo caminho da interface):

(ferramenta: Read ...\anexos\2026-11-14\...-relatorio-trimestral.txt)

(pensou por 1 s)

**Resumo (5 linhas)**

1. **Entregas:** 14 de 18 concluídas (78%). Pendentes: migração do portal de transparência, integração com o protocolo, painel de atendimento (em homologação) e revisão de acessibilidade.
2. **Atendimento:** o tempo de resposta caiu de 3,2 para 2,1 dias com a fila única. A satisfação subiu de 3,8 para 4,3 (212 respostas).
3. **Orçamento:** R$ 391 mil executados de R$ 480 mil (81%). A sobra vem do atraso na contratação do protocolo, e o empenho fica para o 4º trimestre.
4. **Riscos:** perdemos 2 desenvolvedores e há 1 vaga aberta. A hospedagem vai reajustar 12% em janeiro. A acessibilidade tem 37 não conformidades, 9 delas críticas.
5. **Próximos passos:** fechar a migração, assinar o contrato do protocolo, abrir seleção para a vaga e corrigir as 9 críticas até novembro.

**O que você precisa decidir**

- **Janela de manutenção:** quem libera uma data para a migração do portal de transparência? A falta dela é o que atrasa a entrega.
- **Contrato do protocolo:** dá para assinar e empenhar ainda neste trimestre? Daí dependem a integração e a execução do orçamento.
- **Vaga de desenvolvedor:** abrir o processo seletivo agora, e se vale pedir mais de uma vaga, já que saíram duas pessoas.
- **Reajuste de 12% da hospedagem:** aceitar, negociar ou trocar de fornecedor antes de janeiro.
- **Acessibilidade:** confirmar que as 9 críticas têm prioridade e prazo até novembro, e quem fica responsável.

**Atenção:** o relatório fala em fechar a migração "em outubro", e hoje já é 13 de novembro. Vale checar se esse prazo foi cumprido ou precisa de nova data antes da reunião.

> Nota: na primeira rodada desta pergunta o anexo foi entregue por um caminho fora da pasta liberada e o `claude` negou a leitura. Era erro do script de teste (corrigido: agora o anexo sobe por `/api/anexos`, como a interface faz). Esta resposta é da segunda rodada.

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 8. pedido ambíguo (deve perguntar)

**Pergunta:** Faz um logo pra mim.

**HRZZ** (7 s, modelo sonnet):

(pensou por 3 s)

Pra qual marca é o logo? Se for outra, me diz o nome e o estilo que você quer (minimalista, ousado, etc.). Faço em SVG, que dá pra usar em qualquer lugar.

[pergunta com botoes] Logo pra qual marca?
  - HRZZ Studio
  - Outra marca (me diz o nome e o estilo)

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 9. resposta curta e direta

**Pergunta:** Qual a capital da Austrália?

**HRZZ** (3 s, modelo sonnet):

Canberra. Muita gente chuta Sydney ou Melbourne, mas a capital é Canberra.

**claude.ai:**

(colar aqui)

**Anotações:**

---

## 10. conversa longa de 5 mensagens

**Mensagem 1:** Quero planejar 4 dias em Ouro Preto. Quais pontos priorizar?

**HRZZ** (14 s):

(pensou por 6 s)

Com 4 dias dá pra fazer Ouro Preto sem correria e ainda sair da cidade um dia. Minha sugestão de prioridade:

**Dia 1: centro histórico**
- Praça Tiradentes e Museu da Inconfidência
- Igreja de São Francisco de Assis (Aleijadinho e Ataíde)
- Igreja do Carmo e Matriz do Pilar (o ouro por dentro é de cair o queixo)

**Dia 2: mais igrejas e museus**
- Santa Efigênia (a igreja de Chico Rei) e Nossa Senhora das Mercês
- Casa dos Contos e Museu do Oratório
- Museu de Ciência e Técnica, na Escola de Minas (pedras e minerais, vale muito)
- Fim de tarde no Mirante do Morro de Santa Quitéria ou na Ponte dos Contos

**Dia 3: Mariana**
- Maria Fumaça Ouro Preto–Mariana (confira horários e dias de operação antes)
- Catedral da Sé e Praça Minas Gerais
- Mina da Passagem, se curtir algo diferente

**Dia 4: natureza ou Lavras Novas**
- Parque do Itacolomi, com trilhas e cachoeiras (Cachoeira das Andorinhas e outras), ou
- Lavras Novas, vila charmosa a uns 30 min, boa pra almoço e dia mais tranquilo

**Dicas rápidas**
- Leve tênis confortável, porque as ladeiras são pesadas.
- Vários museus fecham na segunda e alguns igrejas cobram ingresso. Confira antes de montar a ordem.
- Coma tutu, feijão tropeiro e doce de leite, e deixe uma noite pra vida noturna perto da praça.
- Feriado e fim de semana lotam. Se puder, vá no meio da semana.

Me diz quando você vai, com quem (casal, família, amigos) e se prefere mais cultura ou mais natureza que eu ajusto o roteiro.

**Mensagem 2:** Tenho R$ 2.000 no total, saindo de Belo Horizonte, em duas pessoas. Cabe?

**HRZZ** (15 s):

(pensou por 7 s)

Cabe sim, com folga se você escolher bem a hospedagem. São valores estimados, então confira preços atuais antes de fechar.

| Item (2 pessoas, 4 dias) | Econômico | Confortável |
|---|---|---|
| Hospedagem (3 noites) | R$ 600 (pousada simples, ~R$ 200/noite) | R$ 1.000 (~R$ 330/noite) |
| Alimentação | R$ 600 (por quilo, lanches, 1 jantar legal) | R$ 900 |
| Ingressos (igrejas, museus, Mariana) | R$ 200 | R$ 300 |
| Transporte BH ↔ Ouro Preto + local | R$ 150 (carro: gasolina e estacionamento) | R$ 250 |
| **Total** | **~R$ 1.550** | **~R$ 2.450** |

Pra ficar dentro dos R$ 2.000:
- Pegue pousada simples, de preferência um pouco fora da praça. Ela costuma custar bem menos e as ladeiras são o único preço.
- Vá no meio da semana. Fim de semana e feriado dobram a diária.
- Almoce em restaurante por quilo e deixe um jantar mais caprichado só pra uma noite.
- Escolha o que vale pagar: a Maria Fumaça e a Mina da Passagem são os itens mais caros do roteiro. Se apertar, corte um dos dois.
- Natureza é de graça: Itacolomi e as cachoeiras custam pouco, e Lavras Novas só pesa na comida.

Se você for de ônibus, a passagem sai um pouco mais cara que a gasolina pra dois, mas você não paga estacionamento nem se preocupa com ladeira e carro.

[pergunta com botoes] Vocês vão de carro ou de ônibus?
  - carro
  - ônibus

**Mensagem 3:** Monte um roteiro dia a dia.

**HRZZ** (11 s):

(pensou por 1 s)

Montei assumindo carro e 3 noites (chegada de manhã, saída no fim do dia 4). Se forem de ônibus, é só trocar o deslocamento de Mariana pelo ônibus urbano ou táxi.

## Dia 1: chegada e centro histórico
- **Manhã:** saída de BH cedo (~2h de estrada), check-in ou deixar a mala na pousada.
- **Almoço:** restaurante por quilo perto da Praça Tiradentes.
- **Tarde:** Praça Tiradentes, Museu da Inconfidência, Igreja de São Francisco de Assis.
- **Fim de tarde:** pôr do sol no Largo do Coimbra ou na Ponte dos Contos.
- **Noite:** jantar simples e volta pra pousada. As ladeiras já cansam no primeiro dia.

## Dia 2: igrejas e museus
- **Manhã:** Matriz do Pilar (a mais cheia de ouro) e Igreja do Carmo.
- **Almoço:** pausa sem pressa, que a manhã é intensa.
- **Tarde:** Santa Efigênia, Nossa Senhora das Mercês e Perdões, e Casa dos Contos.
- **Fim de tarde:** Museu de Ciência e Técnica (Escola de Minas), se der tempo antes de fechar.
- **Noite:** o jantar mais caprichado da viagem, com tutu, feijão tropeiro e doce de leite.

## Dia 3: Mariana
- **Manhã:** Maria Fumaça Ouro Preto–Mariana (confira dia e horário antes, ela nem sempre roda).
- **Almoço:** em Mariana.
- **Tarde:** Catedral da Sé, Praça Minas Gerais e Mina da Passagem (opcional, é o item mais caro).
- **Volta:** de carro ou trem de volta, conforme o horário. Noite livre.

## Dia 4: natureza e despedida
- **Manhã:** check-out e Parque do Itacolomi, com trilha leve ou cachoeira.
- **Almoço:** Lavras Novas, se quiser algo mais tranquilo, ou volte pro centro.
- **Tarde:** última volta pelo centro e compras (artesanato em pedra-sabão e doces).
- **Fim de tarde:** estrada de volta pra BH.

**Dicas**
- Os museus de Ouro Preto muitas vezes fecham na segunda. Se o dia 1 ou 2 cair numa segunda, troque a ordem pelas igrejas, que abrem mais.
- Leve tênis confortável e uma blusa leve, porque à noite esfria.
- Se a Maria Fumaça não estiver rodando no seu dia, vá de carro a Mariana mesmo.

Se me disser as datas da viagem, ajusto o roteiro aos dias de funcionamento.

**Mensagem 4:** Troque o dia 3 por algo mais ao ar livre.

**HRZZ** (12 s):

(pensou por 3 s)

Troquei Mariana por um dia de natureza e ajustei o dia 4 pra não repetir o parque.

## Dia 3: Itacolomi e cachoeiras
- **Manhã:** Parque Estadual do Itacolomi. Leve água, lanche e protetor solar.
  - Trilha até o Pico do Itacolomi: é a mais puxada (umas 3h de ida, subida forte). Vale pela vista, mas só vá se estiverem com preparo e o dia estiver limpo.
  - Se preferirem algo leve, faça as trilhas curtas do parque com mirantes e riachos.
- **Almoço:** piquenique com lanche do mercado ou um prato simples na saída do parque, o que pesa menos no bolso.
- **Tarde:** banho de cachoeira na região (Andorinhas é uma das mais procuradas). Confira o acesso e se precisa de guia, que varia com a estação.
- **Fim de tarde:** volta pra pousada, descanso e jantar leve.

## Dia 4: Lavras Novas e despedida
- **Manhã:** check-out e subida pra Lavras Novas (~30 min). Passeio tranquilo pela vila, mirantes e café.
- **Almoço:** em Lavras Novas, com comida mineira de fogão a lenha.
- **Tarde:** volta ao centro de Ouro Preto pra artesanato em pedra-sabão e doces.
- **Fim de tarde:** estrada de volta pra BH.

**Dicas pra esse dia**
- Calçado fechado e aderente: as pedras molhadas escorregam.
- Evite os dias de chuva forte. Se chover, troque o dia 3 com o dia 2 e deixe as igrejas pra quando fechar o tempo.
- Cachoeira e trilha são gratuitas ou quase (só o parque cobra ingresso), então esse dia ainda alivia o orçamento.

**Mensagem 5:** Resuma tudo numa lista de reservas e compras pra eu fazer esta semana.

**HRZZ** (8 s):

(pensou por 1 s)

## Reservas (faça primeiro)
- [ ] **Pousada em Ouro Preto**: 3 noites, casal, meta de ~R$ 200/noite, de preferência um pouco fora da praça. Escolha cancelamento grátis.
- [ ] **Maria Fumaça**: *só se* mantiverem Mariana. Como o dia 3 virou natureza, pode riscar.
- [ ] **Parque Estadual do Itacolomi**: confirme dias e horário de funcionamento e se precisa agendar ou levar guia pro Pico.
- [ ] **Cachoeira (Andorinhas ou outra)**: confirme o acesso e se tem cobrança ou guia.
- [ ] **Museus e igrejas**: veja quais fecham na segunda, pra encaixar na ordem certa dos dias 1 e 2.
- [ ] **Jantar do dia 2**: reserve se for fim de semana. No meio da semana costuma não precisar.
- [ ] **Se forem de ônibus**: compre as passagens BH ↔ Ouro Preto.

## Compras
- [ ] Tênis ou bota fechada e aderente, pra trilha e pedra molhada (se ainda não tiverem).
- [ ] Protetor solar, repelente e boné.
- [ ] Mochila leve com garrafa d'água, pra o dia do parque.
- [ ] Blusa leve, porque à noite esfria.
- [ ] Lanches pro dia 3 (piquenique): pão, frutas, barrinhas.
- [ ] Capa de chuva fina ou guarda-chuva pequeno.

## Antes de sair de BH
- [ ] Previsão do tempo da semana. Se chover forte, troque o dia 3 com o dia 2.
- [ ] Revisão rápida do carro e tanque cheio (se forem dirigindo).
- [ ] Dinheiro em espécie, que alguns lugares pequenos não aceitam cartão.

Para fechar as datas, me diga quando vão e eu confiro a ordem dos dias com o funcionamento dos museus.

**claude.ai:**

(colar aqui)

**Anotações:**

