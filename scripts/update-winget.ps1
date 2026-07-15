param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [string]$ExePath = "dist\CKBPOS Setup $Version.exe",
    [string]$ManifestDir = "winget-manifest\lpourmoment-dot.ckbpos"
)

$hash = (Get-FileHash $ExePath -Algorithm SHA256).Hash
Write-Host "SHA256: $hash"

$versionDir = Join-Path $ManifestDir $Version
New-Item -ItemType Directory -Path $versionDir -Force | Out-Null

@"
PackageIdentifier: lpourmoment-dot.ckbpos
PackageVersion: $Version
DefaultLocale: pt-BR
ManifestType: version
ManifestVersion: 1.6.0
"@ | Out-File "$versionDir\lpourmoment-dot.ckbpos.yaml" -Encoding UTF8

@"
PackageIdentifier: lpourmoment-dot.ckbpos
PackageVersion: $Version
Platform:
- Windows.Desktop
MinimumOSVersion: 10.0.17763.0
InstallerType: nsis
Scope: user
InstallModes:
- interactive
- silent
- silentWithProgress
UpgradeBehavior: install
Installers:
- Architecture: x64
  InstallerUrl: https://github.com/lpourmoment-dot/CKBPOS/releases/download/v$Version/CKBPOS-Setup-$Version.exe
  InstallerSha256: $hash
ManifestType: installer
ManifestVersion: 1.6.0
"@ | Out-File "$versionDir\lpourmoment-dot.ckbpos.installer.yaml" -Encoding UTF8

@"
PackageIdentifier: lpourmoment-dot.ckbpos
PackageVersion: $Version
PackageLocale: pt-BR
Publisher: CKB
PublisherUrl: https://github.com/lpourmoment-dot
PackageName: CKBPOS
PackageUrl: https://github.com/lpourmoment-dot/CKBPOS
License: Proprietary
ShortDescription: Application Point de Vente Professionnelle
Description: CKBPOS - Application de point de vente professionnelle avec gestion de stock, comptabilite, synchronisation multi-machines, et systeme de licence.
Tags:
- pos
- point-of-sale
- inventory
- accounting
- invoice
ManifestType: defaultLocale
ManifestVersion: 1.6.0
"@ | Out-File "$versionDir\lpourmoment-dot.ckbpos.locale.pt-BR.yaml" -Encoding UTF8

@"
PackageIdentifier: lpourmoment-dot.ckbpos
PackageVersion: $Version
DefaultLocale: pt-BR
ManifestType: version
ManifestVersion: 1.6.0
"@ | Out-File "$ManifestDir\lpourmoment-dot.ckbpos.yaml" -Encoding UTF8

Write-Host ""
Write-Host "Manifest winget v$Version cree dans $versionDir"
Write-Host "SHA256: $hash"
Write-Host ""
Write-Host "Prochaine etape : creer une PR sur microsoft/winget-pkgs"
Write-Host "  1. Fork microsoft/winget-pkgs"
Write-Host "  2. Copier les 3 fichiers dans manifests/l/lpourmoment-dot/ckbpos/$Version/"
Write-Host "  3. Creer la PR"
