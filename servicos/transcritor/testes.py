"""Testes das funcoes de texto do motor (sem baixar modelo). Uso: uv run python testes.py"""
from motor import gerar_srt, gerar_txt, limpar_janela, remover_repeticao

falhas = 0


def confere(nome: str, ok: bool, detalhe: str = ""):
    global falhas
    print(f"  [{'ok' if ok else '--'}] {nome}" + ("" if ok else f": {detalhe}"))
    if not ok:
        falhas += 1


# emenda das janelas do ao vivo
confere("tira as palavras repetidas na emenda", remover_repeticao("vamos tratar do orçamento do próximo", "do próximo trimestre e da reunião") == "trimestre e da reunião")
confere("ignora acento e pontuação na comparação", remover_repeticao("fica combinado que João", "Joao, envia a ata") == "envia a ata")
confere("sem repetição, o texto novo fica inteiro", remover_repeticao("bom dia a todos", "hoje vamos começar") == "hoje vamos começar")
confere("texto anterior vazio", remover_repeticao("", "primeira janela") == "primeira janela")
confere("não apaga tudo se a janela inteira repete", remover_repeticao("a b c", "a b c") == "")

# tiques do Whisper
confere("tira reticências das pontas", limpar_janela("...do orçamento da reunião...") == "do orçamento da reunião")
confere("corta a mesma palavra em laço", limpar_janela("envia a a a a a a hoje") == "envia a a a hoje")
confere("não mexe em texto normal", limpar_janela("o que o que é isso") == "o que o que é isso")

# legenda e texto
segs = [{"inicio": 0.0, "fim": 2.5, "texto": "Bom dia."}, {"inicio": 3661.5, "fim": 3663.0, "texto": "Já se passou uma hora."}]
srt = gerar_srt(segs)
confere("srt numera e usa vírgula nos milissegundos", srt.startswith("1\n00:00:00,000 --> 00:00:02,500\nBom dia.\n"), srt[:60])
confere("srt passa de uma hora", "01:01:01,500 --> 01:01:03,000" in srt, srt)
confere("txt separa parágrafos em pausas longas", gerar_txt(segs).count("\n\n") == 1)
confere("txt com tempo", gerar_txt(segs, com_tempo=True).splitlines()[1].startswith("[1:01:01]"))

print("\ntodos passaram" if not falhas else f"\n{falhas} falha(s)")
raise SystemExit(1 if falhas else 0)
