!macro stopQuizMateProcesses
  ; Current releases use QuizMate.exe. Early broken packages left electron.exe
  ; running without a window title, so match both names by their full install path.
  InitPluginsDir
  File /oname=$PLUGINSDIR\stop-quizmate-processes.ps1 "${BUILD_RESOURCES_DIR}\stop-quizmate-processes.ps1"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop-quizmate-processes.ps1" -InstallDir "$INSTDIR"'
  Pop $0
!macroend

!macro customCheckAppRunning
  quizMateStopRetry:
  !insertmacro stopQuizMateProcesses
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "QuizMate is still running. Close it and retry. Installation cannot continue while application files are in use." IDRETRY quizMateStopRetry
    Quit
  ${EndIf}
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
