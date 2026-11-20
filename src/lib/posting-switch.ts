/**
 * Controle global de auto-postagem de mídias do Drive vs Apenas Aquecimento da Conta.
 * Quando drivePostingEnabled = false: o bot APENAS AQUECE a conta (curte, navega, scrolla),
 * deixando as publicações de fotos/vídeos do Drive pausadas.
 */
let drivePostingEnabled: boolean = false; // Padrão: Modo seguro de Apenas Aquecer

export function isDrivePostingEnabled(): boolean {
  return drivePostingEnabled;
}

export function setDrivePostingEnabled(enabled: boolean): boolean {
  drivePostingEnabled = Boolean(enabled);
  return drivePostingEnabled;
}
