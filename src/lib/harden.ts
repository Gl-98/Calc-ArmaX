/**
 * Deterrentes contra inspeção CASUAL (defesa em profundidade).
 *
 * SEJA HONESTO: isto NÃO impede um atacante técnico. Qualquer código que roda
 * no navegador pode ser lido. A segurança REAL do projeto é a criptografia E2E
 * (ver crypto.ts): mesmo lendo todo o código-fonte, sem o código de 4 dígitos
 * ninguém abre o cofre. Isto aqui só atrapalha o curioso de plantão.
 */
export function installAntiInspect(): void {
  if (import.meta.env.DEV) return; // não atrapalha o desenvolvimento

  // Bloqueia menu de contexto (botão direito).
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Bloqueia atalhos comuns de DevTools / ver-fonte.
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k)) ||
      (e.ctrlKey && k === "u")
    ) {
      e.preventDefault();
    }
  });

  // Impede arrastar imagens/vídeos do cofre para fora.
  document.addEventListener("dragstart", (e) => e.preventDefault());
}
