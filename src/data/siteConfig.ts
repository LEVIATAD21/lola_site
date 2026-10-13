/**
 * Fonte única para os canais oficiais da LOLA.
 *
 * Evita que o handle fique duplicado (e dessincronizado) entre a barra de
 * anúncios, a seção social, o modal de publicação e o rodapé. Para trocar o
 * perfil, altere apenas aqui.
 */

export const INSTAGRAM_HANDLE = 'lola_acoinox';

export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

/** Texto exibido quando o perfil ainda não foi publicado. */
export const SOCIAL_EM_BREVE =
  'Os perfis oficiais da LOLA Aço Inox & Acessórios serão divulgados no lançamento da loja. Até lá, siga o atendimento pelos canais oficiais informados no rodapé.';
