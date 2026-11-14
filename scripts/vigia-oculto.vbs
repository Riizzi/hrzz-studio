' Abre o vigia do HRZZ sem janela nenhuma (o Agendador de Tarefas chama este arquivo pelo wscript.exe).
' Uso: wscript.exe //B //Nologo vigia-oculto.vbs "C:\caminho\node.exe"
' Se o caminho do node nao vier, usa o "node" do PATH. Arquivo so ASCII de proposito.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
node = "node"
If WScript.Arguments.Count > 0 Then node = WScript.Arguments(0)
sh.CurrentDirectory = raiz
' 0 = janela escondida, True = espera terminar (assim a tarefa fica "em execucao" e o Windows nao abre uma segunda)
sh.Run """" & node & """ """ & raiz & "\scripts\vigia.mjs""", 0, True
