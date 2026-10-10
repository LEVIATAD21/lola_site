import { describe, it, expect } from 'vitest';
import { validateAddress } from '../checkoutValidation';
import type { CheckoutAddressData } from '../../components/checkout/CheckoutAddressForm';

const validAddress: CheckoutAddressData = {
  fullName: 'Maria da Silva',
  phone: '(11) 98765-4321',
  cep: '01310-100',
  street: 'Avenida Paulista, 1000',
  complement: 'Apto 42',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  saveAddress: false,
};

describe('validateAddress', () => {
  it('não retorna erros para um endereço completo', () => {
    expect(validateAddress(validAddress)).toEqual({});
  });

  it('exige nome completo', () => {
    const errs = validateAddress({ ...validAddress, fullName: 'An' });
    expect(errs.fullName).toBeDefined();
    expect(validateAddress({ ...validAddress, fullName: 'Ana Maria' }).fullName).toBeUndefined();
  });

  it('exige telefone com DDD', () => {
    expect(validateAddress({ ...validAddress, phone: '12345' }).phone).toBeDefined();
    expect(validateAddress({ ...validAddress, phone: '(11) 98765-4321' }).phone).toBeUndefined();
  });

  it('exige CEP com exatamente 8 dígitos', () => {
    expect(validateAddress({ ...validAddress, cep: '01310-10' }).cep).toBeDefined();
    expect(validateAddress({ ...validAddress, cep: '01310100' }).cep).toBeUndefined();
  });

  it('exige rua, bairro, cidade e estado', () => {
    const errs = validateAddress({
      ...validAddress,
      street: 'Rua',
      neighborhood: '',
      city: '',
      state: '',
    });
    expect(errs.street).toBeDefined();
    expect(errs.neighborhood).toBeDefined();
    expect(errs.city).toBeDefined();
    expect(errs.state).toBeDefined();
  });

  it('aceita telefone celular com 11 dígitos sem máscara', () => {
    expect(validateAddress({ ...validAddress, phone: '11987654321' }).phone).toBeUndefined();
  });
});
