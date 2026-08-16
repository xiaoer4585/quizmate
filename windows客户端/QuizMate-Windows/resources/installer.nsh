!macro stopQuizMateProcesses
  ; Current releases use QuizMate.exe. Early local test packages used electron.exe.
  nsExec::ExecToLog 'taskkill /F /T /IM QuizMate.exe'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /T /IM electron.exe /FI "WINDOWTITLE eq QuizMate*"'
  Pop $0
  Sleep 800
  nsExec::ExecToLog 'taskkill /F /T /IM QuizMate.exe'
  Pop $0
  Sleep 1200
!macroend

!macro preInit
  !insertmacro stopQuizMateProcesses
!macroend

!macro customInit
  !insertmacro stopQuizMateProcesses
!macroend

!macro customUnInstall
  !insertmacro stopQuizMateProcesses
!macroend
