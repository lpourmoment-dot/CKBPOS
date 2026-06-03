; ============================================================
; CKBPOS — installer.nsh
; Règles pare-feu Windows pour la synchronisation LAN
; Inclus automatiquement par electron-builder via nsis.include
; ============================================================

!macro customInstall
  ; --- Port 41234 TCP : WebSocket P2P LAN ---
  nsExec::ExecToLog 'netsh advfirewall firewall add rule \
    name="CKBPOS WebSocket LAN" \
    dir=in action=allow protocol=TCP localport=41234 \
    program="$INSTDIR\CKBPOS.exe" \
    description="CKBPOS synchronisation LAN (WebSocket)"'

  ; --- Port 41235 UDP : Découverte réseau ---
  nsExec::ExecToLog 'netsh advfirewall firewall add rule \
    name="CKBPOS UDP Discovery" \
    dir=in action=allow protocol=UDP localport=41235 \
    description="CKBPOS découverte LAN (UDP broadcast)"'

  ; --- Sortante TCP 41234 (connexion vers autres machines) ---
  nsExec::ExecToLog 'netsh advfirewall firewall add rule \
    name="CKBPOS WebSocket LAN OUT" \
    dir=out action=allow protocol=TCP localport=41234 \
    program="$INSTDIR\CKBPOS.exe"'
!macroend

!macro customUnInstall
  ; Supprimer les règles pare-feu à la désinstallation
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="CKBPOS WebSocket LAN"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="CKBPOS UDP Discovery"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="CKBPOS WebSocket LAN OUT"'
!macroend
