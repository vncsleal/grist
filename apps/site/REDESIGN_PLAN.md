# Quillby Site Redesign Plan

## Context

**Produto:** Quillby — agente de conteúdo AI pra copywriters, donos de negócio e profissionais de marketing.
**Público-alvo:** Não-técnico. Gente que precisa de conteúdo consistente sem viver no terminal.
**Roadmap:** Local mode (agora) → Cloud mode (próximo) → Self-Host (futuro distante).
**Identidade:** Ursinho roxo e creme com rabo de pena nanquim (estilo Pokémon 2D). Fraunces como fonte principal.
**Framework:** Astro 6 (static output). CSS + IntersectionObserver para animações. Sem React islands, sem shadcn, sem Motion runtime.

---

## 1. Sitemap Completo

```
/                               ← Landing page (marketing principal)
├── /#como-funciona             ← Âncora na landing
├── /#para-quem                 ← Âncora na landing
├── /#recursos                  ← Âncora na landing
├── /#instalar                  ← Âncora na landing
├── /#cloud                     ← Âncora na landing (waitlist / "em breve")
│
/docs                           ← Central de documentação
├── /docs/instalar              ← Guia de instalação (principal para não-técnicos)
├── /docs/primeiros-passos      ← Tutorial pós-instalação
├── /docs/clientes              ← Config para Claude Desktop, VS Code, Cursor etc.
├── /docs/cloud                 ← Cloud mode guide (futuro)
├── /docs/self-host             ← Self-host guide (futuro distante)
├── /docs/faq                   ← Perguntas frequentes
│
/privacidade                    ← Política de privacidade
/termos                         ← Termos de serviço
/blog                           ← Blog (futuro, placeholder)
```

### Princípios de navegação

1. **Nav principal** tem no máximo 5 itens. Público não-técnico não processa mais que isso.
2. **Landing page** é autossuficiente. Tudo que um visitante novo precisa está ali.
3. **Páginas auxiliares** (docs, legal, blog) seguem o mesmo layout shell com header/footer consistentes.
4. **Nada quebra se uma página não existir.** Links para Cloud e Self-Host vão para seções de "Em breve" na landing, não para 404.
5. **URLs em português** para páginas de conteúdo (`/privacidade`, `/termos`, `/docs/instalar`). URLs técnicas em inglês (`/docs`, `/docs/clientes`) porque são termos universais.

---

## 2. Design System

### 2.1 Paleta extraída do mascote

As cores abaixo foram extraídas via análise pixel-level da imagem oficial do mascote (ursinho roxo PNG 480×480). Cada valor representa a mediana dos clusters de cor, não aproximação visual.

```css
:root {
  /* Fundo — nanquim profundo (#0a0211 ≈ preto com leve tom roxo) */
  --bg:        #0a0211;
  --bg-1:      #120624;
  --bg-2:      #1a0a30;

  /* Roxo do mascote */
  --purple-deep:   #302050;  /* roxo escuro do corpo, sombras */
  --purple-mid:    #6a4690;  /* roxo médio do corpo principal */
  --purple-light:  #927ba6;  /* roxo claro, transições */
  --purple-pale:   #bfa7c8;  /* tom mais claro do pelo roxo */

  /* Creme do mascote (barriga, focinho, olhos) */
  --cream-light:   #fbf4dc;  /* branco-creme dos olhos */
  --cream-mid:     #e6cadf;  /* creme com tom rosado da barriga */
  --cream-warm:    #f9ebcf;  /* creme mais quente do focinho */

  /* Cores funcionais — derivadas dos tons do mascote */
  --surface:     rgba(251,244,220,0.04);
  --surface-h:   rgba(251,244,220,0.08);
  --border:      rgba(191,167,200,0.12);
  --border-h:    rgba(191,167,200,0.25);

  --primary:     #6a4690;    /* botões, links */
  --primary-h:   #7e54a8;    /* hover */

  --accent:      #fbf4dc;    /* âncoras, highlights */
  --accent-dim:  #f9ebcf;    /* destaque secundário */

  /* Texto */
  --text:        #f0eafa;
  --muted:       rgba(240,234,250,0.5);
  --faint:       rgba(240,234,250,0.22);

  /* Tipografia */
  --serif:       'Fraunces Variable', ui-serif, Georgia, serif;
  --sans:        'Nunito Variable', ui-sans-serif, system-ui, sans-serif;
  --mono:        'DM Mono', monospace;
}
```

### 2.2 Mapeamento mascote → site

| Elemento do mascote | Cor | Uso no site |
|--------------------|-----|-------------|
| Nanquim (contorno) | `#0a0211` | Background principal |
| Roxo escuro (sombra do corpo) | `#302050` | Superfície elevada (cards) |
| Roxo médio (corpo principal) | `#6a4690` | Botões, links, ícones |
| Roxo claro (pelo claro) | `#927ba6` | Hover, bordas sutis |
| Roxo pálido | `#bfa7c8` | Bordas, linhas decorativas |
| Creme barriga | `#e6cadf` | Badges, tags, destaques menores |
| Creme claro (olhos) | `#fbf4dc` | **Texto, headlines** — contraste máximo |
| Creme quente (focinho) | `#f9ebcf` | Destaques quentes, callouts |

**Regra:** A paleta anterior (violetas frios `#a78bfa`, `#7c3aed`, `#c4b5fd`) é **substituída**, não combinada. Violeta é frio/azulado e conflita com o roxo terroso/quente do urso.

### 2.3 Tipografia

| Elemento | Fonte | Peso | Tamanho | Tracking |
|----------|-------|------|---------|----------|
| H1 hero | Fraunces | 800 | clamp(3rem, 6vw, 5.5rem) | -0.025em |
| H2 seção | Fraunces | 800 | clamp(2.2rem, 4vw, 3.5rem) | -0.02em |
| H3 card | Fraunces | 600 | 1.1rem — 1.3rem | — |
| Body | Nunito | 400 | 1rem — 1.075rem | — |
| Small | Nunito | 500 | 0.8125rem | — |
| Mono (código, labels) | DM Mono | 400 | 0.75rem — 0.875rem | 0.02em |
| Eyebrow | DM Mono | 500 | 0.6875rem | 0.13em, uppercase |

**Uso do Fraunces:** A alma tipográfica do Quillby. 800 para headlines (impacto), 300 itálico para ênfase poética (subtítulos, blockquotes). Nunito no body dá legibilidade.

### 2.4 Mascote — Ursinho Nanquim

Extraído do PNG e WebM (24fps, 480×480, ~5s de animação com float):

**Descrição visual:** Urso estilizado em 2D com proporção 1.1:1 (quase quadrado). Cabeça grande (~23% da altura), corpo médio (~56%), pernas/rabo (~22%). Expressão amigável, olhos grandes e arredondados com pupila nanquim sobre fundo creme claro. Contorno em nanquim (traço visível, não suave). Textura de pelo sugerida por variação de tom, não por linhas detalhadas.

**Rabo de pena nanquim:** Na parte traseira inferior, feito do mesmo tom nanquim do contorno, com formato de pena estilizada.

**Onde aparece:**

| Contexto | Uso | Formato |
|----------|-----|---------|
| **Hero** | Animação central — mascote flutuando | WebM existente ou CSS float keyframe |
| **Features** | Mascote pequeno interagindo com cada card | Futuro (ilustrações estáticas) |
| **Break visual** | Mascote central com quote | PNG com posicionamento |
| **CTA final** | Mascote apontando pro botão | PNG pequeno |
| **404** | Mascote confuso | Futuro |
| **Favicon** | Rostinho do urso | SVG existente |
| **Nav** | Ícone do urso (já existe) | PNG/SVG |

**Regras:**
- Nunca usado como wallpaper ou background pattern
- Sempre com olhos visíveis
- Animação sutil (float, piscar), nunca loop agressivo
- Em telas pequenas, pode reduzir ou sumir (hero mobile)

### 2.5 Atmosfera

Manter os elementos existentes que funcionam com a nova paleta:

- **Noise overlay:** SVG data URI com opacidade 0.03
- **Glow bg:** Radial gradient central com `--purple-mid` a 15% opacidade
- **Ambient blobs:** 3 divs com blur(60-80px), animação drift, usando `--purple-deep` e `--purple-mid`

**Proibido:** Three.js, WebGL, partículas JS, background beams, aurora, shader backgrounds.

### 2.6 Grid e Spacing

```css
--section-padding: clamp(5rem, 9vw, 9rem);
--content-max: 1200px;
--content-padding: clamp(1.5rem, 5vw, 5rem);
--card-gap: 1.5rem;
```

### 2.7 O que NÃO usar

- React/Preact islands (peso desnecessário pra landing page estática)
- shadcn/ui ou qualquer biblioteca de componentes
- Motion/framer-motion (CSS + IntersectionObserver resolve)
- Three.js / WebGL
- GSAP
- Qualquer runtime JS que exija hydration

---

## 3. Landing Page — Estrutura

### Navegação (Nav)

```
[urso favicon] Quillby     Como funciona · Pra quem · Docs · GitHub     [Instalar]
```

5 itens max. Mobile: hamburger que expande os mesmos links + "Instalar" como primeiro item.

### Seção 1: Hero

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌────────────────────────────┐  ┌──────────────────────────────┐   │
│  │ The internet already       │  │                              │   │
│  │ wrote your next post.      │  │     [URSINHO + ARTIGOS       │   │
│  │                            │  │      FLUTUANDO]              │   │
│  │ Um resumo curado e um     │  │                              │   │
│  │ rascunho pronto pra       │  │                              │   │
│  │ publicar — vindos das suas│  │                              │   │
│  │ fontes, filtrados pro seu │  │                              │   │
│  │ público, escritos na sua  │  │                              │   │
│  │ voz.                      │  │                              │   │
│  │                            │  │                              │   │
│  │ [  Ver como funciona →  ]  │  │                              │   │
│  │ [  Instalar no Mac  ↓  ]  │  │                              │   │
│  │                            │  │                              │   │
│  │ Grátis · Funciona com     │  │                              │   │
│  │ Claude · Local-first      │  │                              │   │
│  └────────────────────────────┘  └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**CTA primário:** "Ver como funciona →" → ancora #como-funciona
**CTA secundário:** "Instalar no Mac" → ancora #instalar
**Trust bar:** Grátis · Funciona com Claude · Local-first

### Seção 2: Como Funciona (4 passos)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  𐄂 Como funciona                                                     │
│                                                                     │
│  Quatro passos. Nenhum app novo.                                    │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │ 01      │  │ 02      │  │ 03      │  │ 04      │               │
│  │ Instale │  │ Crie um │  │ Quillby │  │ Peça um │               │
│  │ Quillby │  │ espaço  │  │ lê a    │  │ post    │               │
│  │         │  │ de      │  │ internet │  │         │               │
│  │         │  │ trabalho│  │ pra você│  │ "O que  │               │
│  │         │  │         │  │         │  │ eu posto │               │
│  │         │  │ 1 ws    │  │ RSS+    │  │ hoje?" →│               │
│  │         │  │ por     │  │ Reddit+ │  │ rascunho│               │
│  │         │  │ cliente │  │ Medium  │  │ pronto  │               │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Cada card: número (01-04), título curto, descrição 1 frase. Sem jargão técnico.

### Seção 3: Antes / Depois

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐      │
│  │ Antes do Quillby    │  │ Com Quillby                     │      │
│  ├─────────────────────┤  ├──────────────────────────────────┤      │
│  │ • 45min catando     │  │ • "O que eu posto hoje?" —      │      │
│  │   artigo pra postar │  │   briefing curado em segundos   │      │
│  │ • Página em branco  │  │ • Rascunho pronto baseado em    │      │
│  │ • IA genérica que   │  │   artigo real, na sua voz      │      │
│  │   parece robô       │  │ • A cada post aprovado, fica    │      │
│  │ • Postar quando dá  │  │   mais parecido com você        │      │
│  └─────────────────────┘  └──────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Split sem gradiente vermelho. Cada bullet é resultado, não feature.

### Seção 4: Recursos (6 cards, grid 3×2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  𐄂 O que ele faz                                                    │
│                                                                     │
│  Lê, filtra, escreve. Na sua voz.                                   │
│                                                                     │
│  📡 Lê a internet         🎯 Filtra o que importa    ✍️ Escreve na  │
│  RSS, Reddit, Medium      Perfil por workspace       sua voz       │
│  — as fontes que você     define o que é             Sem som de IA │
│  escolhe                  relevante                  genérica      │
│                                                                     │
│  🧠 Aprende com você      📁 Um workspace por        🌍 Qualquer   │
│  Seus feedbacks           contexto                   nicho,        │
│  refinam o estilo         Cliente, projeto,          qualquer      │
│                           newsletter                 língua        │
└─────────────────────────────────────────────────────────────────────┘
```

### Seção 5: Pra Quem É (6 indústrias + "seu nicho")

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  𐄂 Pra quem é                                                      │
│                                                                     │
│  Qualquer nicho. Uma ferramenta.                                    │
│                                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────┐│
│  │Dev      │ │Marketing│ │Design   │ │Finanças │ │Direito  │ │+   ││
│  │         │ │         │ │         │ │         │ │         │ │seu ││
│  │         │ │         │ │         │ │         │ │         │ │nicho││
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Seção 6: Mascote (break visual)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   [URSINHO MÉDIO]                                  │
│                                                                     │
│   "Você já sabe o que dizer. Só precisava de alguém                │
│    lendo a internet por você."                                      │
│                                                                     │
│              [  Começar a postar →  ]                               │
└─────────────────────────────────────────────────────────────────────┘
```

Mascote central + quote + CTA. Sem grid, sem cards.

### Seção 7: Instalação

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  𐄂 Instalar                                                        │
│                                                                     │
│  Pronto em 3 minutos.                                               │
│                                                                     │
│  ┌─────────────────────────────────────┐  ┌─────────────────────┐   │
│  │ [Download para Mac]                 │  │ 1. Instale e        │   │
│  │ Clique duas vezes.                  │  │    reinicie Claude  │   │
│  │ Depois abra o Claude e diga:        │  │ 2. Crie seu primeiro│   │
│  │ "Me configure o Quillby"            │  │    workspace        │   │
│  │ ┌─ Outros métodos ─────────────────┐│  │ 3. Quillby descobre │   │
│  │ │ Windows · Linux · npm · Docker   ││  │    suas fontes      │   │
│  │ └──────────────────────────────────┘│  │ 4. "O que eu posto  │   │
│  └─────────────────────────────────────┘  │    hoje?"           │   │
│                                           └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Mac como padrão.** Alternativas técnicas colapsadas em acordeão.

### Seção 8: Cloud (Em Breve)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  𐄂 Quillby Cloud                                                   │
│                                                                     │
│  Precisa de algo maior?                                             │
│  • Acesse de qualquer dispositivo                                  │
│  • Convide sua equipe                                               │
│  • Dashboard web                                                    │
│                                                                     │
│  Cloud mode está sendo preparado.                                   │
│  [  Avise quando lançar →  ]                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Seção sutil com waitlist. Captura leads sem fingir que o produto existe.

---

## 4. Páginas Auxiliares

### /docs — Central de Documentação

```
┌──────────────────────────────────────────────────────────────┐
│ NAV                                                          │
├──────────┬───────────────────────────────────────────────────┤
│ Sidebar  │ Breadcrumb: Docs > Instalar                       │
│          │                                                   │
│ ▪ Instalar│ Conteúdo markdown com tipografia refinada         │
│ ▪ Primeiros│                                                  │
│   passos  │                                                  │
│ ▪ Clientes│                                                  │
│ ▪ Cloud   │                                                  │
│   (breve) │                                                  │
│ ▪ FAQ     │                                                  │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
│ FOOTER                                                        │
└───────────────────────────────────────────────────────────────┘
```

Layout: sidebar (lista de docs, indicador de página atual) + conteúdo. Cloud aparece com badge "em breve".

### /docs/instalar — Instalação Detalhada

Versão expandida da seção de instalação da landing. Inclui macOS (.pkg), Windows (.exe), Linux (curl), npm.

### /docs/primeiros-passos — Tutorial Narrativo

1. Instale o Quillby
2. Abra o Claude Desktop
3. Diga "Me configure o Quillby"
4. Responda as perguntas (seu papel, nicho, público)
5. Pronto — fontes descobertas automaticamente
6. "O que eu posto hoje?"

### /docs/clientes — Configuração por Cliente MCP

- Claude Desktop (stdio)
- Claude.ai (futuro, via Cloud)
- VS Code / Cursor (stdio)
- Claude Code (stdio)

### /docs/cloud — Placeholder

Descrição do que será Cloud mode + formulário de interesse.

### /docs/faq — Perguntas Frequentes

"Precisa de internet?", "Funciona sem Claude?", "Meus dados ficam seguros?", "Posso usar com cliente X?"

### /privacidade e /termos

Layout de docs com sidebar mínima. Conteúdo existente já ok, só formatação.

### /blog (placeholder)

```
┌──────────────────────────────────────────────┐
│ Blog                                         │
│ Em breve.                                    │
│ Enquanto isso, confira a documentação →       │
└──────────────────────────────────────────────┘
```

---

## 5. Roadmap de Features no Site

| Feature | Onde aparece | Quando |
|---------|-------------|--------|
| Local mode | Hero + Instalar | Lançamento |
| Cloud mode | Seção "Em breve" + waitlist | Lançamento |
| Cloud live | /docs/cloud vira real | Cloud lançado |
| Self-Host | Aparece como subseção | Self-Host lançado |
| Blog | /blog vira real | Futuro |
| Preços | /precos (nova página) | Cloud lançado |

**Regra de ouro:** Nenhum link quebra. Páginas futuras retornam conteúdo minimalista com "Em breve" + link de volta pra landing.

---

## 6. Performance Budget

| Métrica | Alvo |
|---------|------|
| LCP | < 1.5s |
| TBT | < 50ms |
| CLS | < 0.05 |
| JS total | < 50KB (scripts inline + Lenis opcional) |
| Page weight | < 300KB |

---

## 7. Fases de Implementação

### Fase 0: Infraestrutura (1 sessão)

- [ ] Atualizar paleta de cores no global.css (substituir violetas pelos roxos do mascote)
- [ ] Ajustar background glow/blobs com novas cores
- [ ] Refatorar Nav.astro com links corretos e mobile hamburger
- [ ] Refatorar Footer.astro com links corretos (privacidade, termos)
- [ ] Criar DocLayout com sidebar real e breadcrumb
- [ ] Ajustar content.config.ts: adicionar docs de instalar, primeiros-passos, clientes, faq
- [ ] Criar rotas /privacidade e /termos (português)

### Fase 1: Landing Page (2 sessões)

- [ ] Separar CSS do index.astro em componentes por seção
- [ ] Hero com nova paleta, CTA "Ver como funciona", mascote integrado
- [ ] Seção "Como funciona" (4 passos)
- [ ] Seção "Antes/Depois"
- [ ] Seção "Recursos" (6 cards)
- [ ] Seção "Pra quem é" (6 cards + "seu nicho")
- [ ] Seção "Mascote" (break visual)
- [ ] Seção "Instalar" (Mac padrão, alternativas colapsadas)
- [ ] Seção "Cloud (Em breve)" com waitlist

### Fase 2: Páginas Auxiliares (1 sessão)

- [ ] /docs — Central com sidebar
- [ ] /docs/instalar
- [ ] /docs/primeiros-passos
- [ ] /docs/clientes
- [ ] /docs/faq
- [ ] /docs/cloud (placeholder)
- [ ] /privacidade
- [ ] /termos
- [ ] /blog (placeholder)

### Fase 3: Polimento (1 sessão)

- [ ] Scroll reveals com stagger
- [ ] Nav glassmorphism consistente
- [ ] Responsivo mobile/tablet completo
- [ ] prefers-reduced-motion
- [ ] Lighthouse audit (95+)
- [ ] Build limpo, zero warnings, zero links quebrados

---

## 8. Anexo: Dados do Mascote (Extraídos Pixel-Level)

**Arquivo fonte:** `public/hero-mascot-alpha.webp` (480×480, RGBA, alpha channel)
**Animação:** `public/hero-mascot-alpha.webm` (24fps, 4.96s, VP8 com alpha)
**Favicon:** `public/favicon.svg` (path único que se adapta a dark/light mode)

**Cores exatas dos clusters (mediana):**

| Cluster | Hex | Amostras |
|---------|-----|----------|
| Roxo escuro (corpo) | `#302050` | 19.8% |
| Roxo médio (corpo) | `#8d75a2` | 6.0% |
| Roxo claro (transição) | `#bfa7c2` | 2.1% |
| Creme claro (barriga/olhos) | `#fbf4dc` | 36.1% |
| Creme médio (focinho) | `#e6cadf` | 24.9% |
| Nanquim (contorno/rabo) | `#0a0211` | 11.2% |

**Proporções:** Bounding box 693×631px. Cabeça ~23% altura total, corpo ~56%, pernas/rabo ~22%.
**Estilo:** 2D digital, contorno nanquim, paleta limitada (4 famílias de cor), olhos grandes e expressivos.
