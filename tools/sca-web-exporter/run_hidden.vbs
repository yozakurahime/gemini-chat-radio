Option Explicit

Dim shell, rootPath, runBatch, command
Set shell = CreateObject("WScript.Shell")

rootPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
runBatch = rootPath & "\run_now.bat"
command = "cmd /c """ & runBatch & """"

shell.Run command, 0, True
