---
title: FAQ
description: Perguntas frequentes sobre o Quillby
order: 3
---

## Gerais

<details class="faq-q">
<summary>Preciso saber programar?</summary>
Não. Se você sabe conversar com o Claude, você sabe usar o Quillby. Tudo acontece através de linguagem natural — você pede, ele faz.
</details>

<details class="faq-q">
<summary>Funciona com qualquer nicho?</summary>
Sim. Tecnologia, marketing, direito, finanças, saúde, educação, imobiliário, moda — qualquer área com conteúdo online. Você conta seus temas ao Quillby uma vez, e ele se adapta.
</details>

<details class="faq-q">
<summary>É grátis?</summary>
Sim. O modo local é completamente gratuito e sempre será. Roda na sua máquina, sem conta, sem assinatura. Um modo cloud com workspaces compartilhados e dashboard web está em desenvolvimento.
</details>

<details class="faq-q">
<summary>O Quillby é open source?</summary>
Sim. Licença MIT. O código fonte completo está no [GitHub](https://github.com/vncsleal/quillby). Qualquer pessoa pode inspecionar, modificar ou contribuir.
</details>

<details class="faq-q">
<summary>Qual a diferença entre o Quillby e usar o Claude sozinho?</summary>
O Claude é um assistente de conversa. O Quillby é um agente de conteúdo que vive dentro do Claude. Em vez de começar do zero toda vez, o Quillby:

- Lê suas fontes todo dia e traz o que é relevante
- Escreve na sua voz estabelecida, não num tom genérico de IA
- Lembra seu estilo por workspace (cliente, marca, newsletter)
- Planeja campanhas e acompanha seu calendário de conteúdo
</details>

## Configuração

<details class="faq-q">
<summary>O que preciso para usar o Quillby?</summary>
Você precisa do [Claude Desktop](https://claude.ai/download) (gratuito). Os instaladores do macOS e Windows incluem tudo o mais. Para o método de instalação via npx, você também precisa do [Node.js 20+](https://nodejs.org).
</details>

<details class="faq-q">
<summary>Preciso do Claude Desktop?</summary>
Sim. O Quillby se conecta ao Claude Desktop e dá a ele novas habilidades — ler feeds, escrever posts, planejar campanhas — tudo dentro do chat que você já usa.
</details>

<details class="faq-q">
<summary>Quanto tempo leva a configuração?</summary>
Cerca de três minutos. Baixe o instalador, reinicie o Claude e responda duas perguntas sobre seu trabalho. Essa é a configuração inteira.
</details>

## Uso Diário

<details class="faq-q">
<summary>Posso usar para vários clientes?</summary>
Sim. Cada cliente tem seu próprio workspace com memória, fontes, perfil de voz e rascunhos separados. Nada se mistura entre workspaces.
</details>

<details class="faq-q">
<summary>Ele aprende meu estilo de escrita?</summary>
Sim. Cada rascunho que você salva se torna um exemplo de voz. Com o tempo, o Quillby se adapta ao seu tom, vocabulário e ritmo. Workspaces diferentes podem ter vozes completamente diferentes.
</details>

<details class="faq-q">
<summary>Posso planejar conteúdo com antecedência?</summary>
Sim. O Quillby tem um sistema de campanhas para séries de conteúdo de múltiplos estágios, um quadro de tarefas para acompanhar o progresso e um calendário para ver o que está publicado quando — tudo dentro do Claude.
</details>

<details class="faq-q">
<summary>Ele gera imagens ou áudio?</summary>
O Quillby pode gerar imagens e áudio se você conectar um serviço compatível como OpenAI ou ElevenLabs. Isso é opcional — o fluxo principal de resumo e rascunho não precisa de nada além do Claude.
</details>

## Privacidade

<details class="faq-q">
<summary>Meus dados estão seguros?</summary>
Tudo roda na sua máquina. Nada sai dela a menos que você conecte explicitamente um serviço terceiro. O código é open source e auditável.
</details>

<details class="faq-q">
<summary>O Quillby coleta dados de uso?</summary>
Não. O Quillby não coleta análises, relatórios de erro, telemetria ou qualquer informação sobre como você o usa.
</details>

<details class="faq-q">
<summary>Onde meus dados são armazenados?</summary>
Todos os dados do seu workspace ficam em `~/.quillby/` no seu sistema de arquivos local. Você pode fazer backup copiando essa pasta, sincronizar com Dropbox ou abrir em qualquer editor de texto.
</details>
