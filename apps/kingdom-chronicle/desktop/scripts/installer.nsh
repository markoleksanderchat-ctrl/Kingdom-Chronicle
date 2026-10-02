; Seed the stable per-user path only for a first NSIS install.
; Updates keep the NSIS-registered path; /D remains supported by the framework.
!macro preInit
  !ifndef BUILD_UNINSTALLER
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == ""
      WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\KingdomChronicle"
    ${EndIf}
  !endif
!macroend

; Chromium's restricted subprocesses must be able to read installed binaries.
; Existing inherited AppContainer entries can otherwise cause startup crashes.
; Grant only read/execute inside this app's install tree; retain all existing rules.
!macro customInstall
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-2:(OI)(CI)(RX)"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "Kingdom Chronicle restricted-process permissions failed: $0 $1"
    MessageBox MB_OK|MB_ICONSTOP "Kingdom Chronicle could not prepare its installation folder for Windows restricted processes. Please retry the installer. Your colony reports and settings are retained." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend
