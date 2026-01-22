> [!IMPORTANT]  
> Install directly from GitHub Actions here:
> 
> <a href="https://github.com/cmss13-devs/cm-launcher/releases/latest/download/CM-SS13.Launcher_0.5.0_x64-setup.exe">
>  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows download link"/>
> </a>

# CM Launcher

A rewrite of the DreamMaker backed CMLauncher, using [Tauri](https://v2.tauri.app/) and managing BYOND versions internally.

## Screenshots

| CM-SS13 Game Servers | Authentication Options (Steam only available in Steam builds) | Automatic Relay Selection |
|-|-|-|
| <img width="1992" height="1188" alt="VcnBDvrlqS7Tfryu@2x" src="https://github.com/user-attachments/assets/d8b5ac37-e818-45cb-b020-5fd96dc64f50" /> | <img width="1981" height="1179" alt="0SR6wKmNaPuefRBK@2x" src="https://github.com/user-attachments/assets/e196bac1-f134-42da-9990-4e4864c24129" /> | <img width="1996" height="1200" alt="6whuDKXeRfZD5E3f@2x" src="https://github.com/user-attachments/assets/b4f08132-6740-4b50-bb91-8f527e2aab5f" /> |

## Features

### BYOND
- Automatically installs the correct version for the game server you are connecting to.
- Private WebView2 install location to avoid conflicts with system BYOND.

### Authentication
- CM-SS13 Authentication via web browser authentication flow
  - Handles tokens refresh to stay logged in indefinitely
- BYOND Authentication via pager
- Steam Authentication via Authentication ticket flow/Authentik backend

### Rich Presence
- Supports Steam and Discord rich presence
- Displays currently launched server, as well as the number of players online
- Allows friends to join directly from the friends list

### CI/CD
- Automatically deploys tagged versions to GitHub Releases and Steam
- Steam releases are pushed to a `latest` branch for manual deployment to `default`.
