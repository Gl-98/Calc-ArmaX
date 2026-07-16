# Calculadora‑Cofre 🔐

**🌐 No ar: https://gl-98.github.io/calc-cofre/**

Uma **calculadora científica** que, para qualquer pessoa, é só uma calculadora
comum. Quem sabe o **código secreto de 4 dígitos** digita esse número e toca em
**“=”** para abrir um **cofre criptografado** onde ficam fotos, vídeos e arquivos.

Recursos: cofre com **álbuns/pastas**, **visualizador in‑app** (foto/vídeo sem
baixar) com **miniaturas reais**, **troca de senha** pelo gesto secreto `0000`
(sem perder arquivos), trava automática e wipe anti‑força‑bruta.

> PWA (roda no navegador e pode ser instalada como app no celular/PC).
> Front‑end: Vite + React + TypeScript + Tailwind. Nuvem opcional: Supabase.

---

## 🧠 Modelo de segurança (blue team)

A pergunta central do projeto era *"como impedir que inspecionem o código?"*.
A resposta honesta: **não dá pra esconder 100% o código de um app** (web ou
nativo). Então a segurança **não depende disso**. Ela é baseada em
**criptografia de ponta a ponta (E2E) com conhecimento zero**:

| Camada | O que faz |
|---|---|
| **Derivação de chave** | O código de 4 dígitos passa por PBKDF2‑SHA256 (600.000 iterações) → chave AES‑256. O código **nunca** é salvo. |
| **Criptografia dos arquivos** | Cada arquivo é cifrado com **AES‑256‑GCM** (IV único) **antes** de sair do dispositivo. |
| **Verificação do código** | Um "canário" cifrado valida o código sem armazenar hash dele. |
| **Zero‑knowledge na nuvem** | O Supabase só recebe **bytes cifrados** e metadados cifrados. Nunca vê nome, conteúdo nem código. |
| **Wipe automático** | Após 10 tentativas erradas seguidas, o cofre é apagado. |
| **Trava automática** | Ao minimizar/trocar de aba, o cofre bloqueia sozinho. |
| **Anti‑inspeção casual** | Bloqueia botão direito / F12 / ver‑fonte — apenas fricção, **não** é a defesa principal. |

**Conclusão:** mesmo alguém lendo todo o código‑fonte no navegador **não abre o
cofre nem lê os arquivos** sem o código de 4 dígitos. É esse o ponto.

---

## 🚀 Como rodar

```bash
npm install
npm run dev      # abre em http://localhost:5173
```

Build de produção:

```bash
npm run build
npm run preview
```

Na primeira vez o app pede para você **criar o código de 4 dígitos**. Depois
abre sempre como calculadora. Para entrar no cofre: digite o código e toque em
**“=”**.

---

## 🚢 Publicação (GitHub Pages)

O site é publicado automaticamente pelo GitHub Actions (`.github/workflows/deploy.yml`).
**Para atualizar, é só dar `git push` na branch `main`** — o Actions builda e
republica em `https://gl-98.github.io/calc-cofre/` em ~1–2 minutos.

O build usa `VITE_BASE=/calc-cofre/` (subcaminho do Pages). Para hospedar em um
domínio raiz (Vercel/Netlify/Cloudflare Pages), basta importar o repositório —
lá o `base` fica `/` automaticamente e nada mais precisa mudar.

## ☁️ Ativar a nuvem (Supabase) — opcional

O app funciona **100% local** (IndexedDB) sem configurar nada. Para sincronizar
entre aparelhos:

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute.
3. Confirme que existe um bucket **privado** chamado `vault` (o script cria).
4. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=...        # Project Settings > API > Project URL
   VITE_SUPABASE_ANON_KEY=...   # Project Settings > API > anon public key
   ```
5. Reinicie o `npm run dev`.

### Sincronizar entre aparelhos
Cada dispositivo gera um `vaultId` aleatório (guardado localmente). Para abrir o
mesmo cofre em outro aparelho, você precisa **do mesmo `vaultId` e do mesmo
código**. (Uma tela para exportar/importar o `vaultId` é o próximo passo natural
— o gancho já existe em `src/lib/supabase.ts` e `Vault.tsx`.)

---

## 🗺️ Mapa do código

```
src/
├─ lib/
│  ├─ crypto.ts     ← núcleo: PBKDF2, AES‑GCM, canário de verificação
│  ├─ passcode.ts   ← setup/verificação do código + wipe por tentativas
│  ├─ vault.ts      ← cofre local (IndexedDB), cifra/decifra arquivos
│  ├─ supabase.ts   ← sync opcional na nuvem (só bytes cifrados)
│  ├─ calc.ts       ← avaliador matemático seguro (sem eval)
│  └─ harden.ts     ← deterrentes anti‑inspeção casual
├─ components/
│  ├─ Setup.tsx     ← 1ª execução: cria o código
│  ├─ Calculator.tsx← calculadora + porta secreta
│  ├─ ChangePassword.tsx ← troca de senha (gesto 0000) sem perder arquivos
│  └─ Vault.tsx     ← galeria + álbuns: add / ver / mover / baixar / apagar
└─ App.tsx          ← máquina de estados (setup → calc → cofre)
```

---

## ⚠️ Limitações honestas

- **Esqueceu o código?** Não há recuperação — é o preço do zero‑knowledge.
- **HTTPS obrigatório** em produção (Web Crypto exige contexto seguro).
- A "anti‑inspeção" (`harden.ts`) é cosmética; a segurança real é a criptografia.
- Sem login, o acesso à nuvem depende do sigilo do `vaultId` (122 bits). Para
  ambiente mais crítico, migre para Supabase Auth (login anônimo) + RLS por
  `auth.uid()`.

---

## 💡 Próximas ideias

- Exportar/importar `vaultId` por QR Code para sincronizar aparelhos.
- **Código de coação (duress)**: um segundo código que abre um cofre‑isca vazio.
- Álbuns/pastas dentro do cofre e busca.
- Upgrade de PBKDF2 → **Argon2id** (via wasm) para brute‑force ainda mais caro.
- Captura direta da câmera para dentro do cofre.
```
