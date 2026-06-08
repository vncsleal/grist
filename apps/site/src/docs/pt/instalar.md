---
title: Instalação
description: Instale o Quillby no macOS, Windows ou Linux
order: 1
---

O Quillby roda na sua máquina e se conecta ao Claude Desktop com um clique. Escolha sua plataforma abaixo.

## macOS

### Arraste e solte (recomendado)

[Baixe o .dmg](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.dmg), abra e arraste o Quillby para a pasta Applications. Clique duas vezes no Quillby uma vez — ele configura tudo automaticamente.

Também disponível como [instalador .pkg](https://github.com/vncsleal/quillby/releases/latest/download/quillby-macos.pkg).

### Script de terminal

Abra o Terminal e cole:

```bash
curl -fsSL https://raw.githubusercontent.com/vncsleal/quillby/main/install.sh | bash
```

O script detecta se você tem Apple Silicon ou Intel, baixa o binário correto e conecta o Quillby ao Claude Desktop automaticamente.

## Windows

### Instalador (recomendado)

[Baixe o instalador .exe](https://github.com/vncsleal/quillby/releases/latest/download/quillby-windows.exe) e execute. O instalador configura o Quillby, registra no Adicionar/Remover Programas e conecta ao Claude Desktop — sem passos manuais.

### Script de terminal

Abra o PowerShell e cole:

```powershell
irm https://raw.githubusercontent.com/vncsleal/quillby/main/install.ps1 | iex
```

## Linux

O Claude Desktop não está disponível para Linux, mas você pode usar o Quillby com qualquer cliente MCP compatível como Cursor, VS Code ou Claude Code:

```bash
npx -y @vncsleal/quillby quillby-mcp
```

## Qualquer plataforma (npm)

Se você tem Node.js instalado, pode instalar o Quillby como pacote global:

```bash
npm install -g @vncsleal/quillby
```

Depois adicione à configuração do seu cliente de IA:

```json
{
  "mcpServers": {
    "quillby": {
      "command": "quillby-mcp"
    }
  }
}
```

## Próximos passos

Depois de instalar:

1. **Feche o Claude Desktop completamente** (clique com o botão direito no ícone → Sair)
2. **Abra o Claude Desktop novamente**
3. Em um novo chat, diga: `Me configura o Quillby`

O Claude vai fazer algumas perguntas sobre seu trabalho e para quem você escreve. Responda naturalmente — é assim que o Quillby aprende sua voz. Você terá seu primeiro resumo em menos de cinco minutos.
