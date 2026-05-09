Option Explicit

Dim shell, rootPath, psScript, command
Set shell = CreateObject("WScript.Shell")

rootPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
psScript = rootPath & "\run_sca_web_export.ps1"
command = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """"

shell.Run command, 0, True
