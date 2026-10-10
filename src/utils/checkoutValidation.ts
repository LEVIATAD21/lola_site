import type { CheckoutAddressData, CheckoutAddressErrors } from '../components/checkout/CheckoutAddressForm';

/**
 * Valida o formulário de entrega antes de permitir a finalização.
 * Retorna um mapa de erros por campo — vazio quando o formulário é válido.
 */
export function validateAddress(data: CheckoutAddressData): CheckoutAddressErrors {
  const errs: CheckoutAddressErrors = {};
  const digits = data.phone.replace(/\D/g, '');
  const cepDigits = data.cep.replace(/\D/g, '');

  if (data.fullName.trim().length < 3) {
    errs.fullName = 'Informe seu nome completo.';
  }
  if (digits.length < 10 || digits.length > 11) {
    errs.phone = 'Informe um telefone válido com DDD.';
  }
  if (cepDigits.length !== 8) {
    errs.cep = 'Informe um CEP com 8 dígitos.';
  }
  if (data.street.trim().length < 5) {
    errs.street = 'Informe rua e número.';
  }
  if (!data.neighborhood.trim()) {
    errs.neighborhood = 'Informe o bairro.';
  }
  if (!data.city.trim()) {
    errs.city = 'Informe a cidade.';
  }
  if (!data.state) {
    errs.state = 'Selecione o estado.';
  }
  return errs;
}
