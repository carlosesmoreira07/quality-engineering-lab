export const baselineProduct = {
  name: 'Stainless Steel Thermos - Yellow',
  sku: 'THERMO-005-YEL',
  path: '/accessories/stainless-steel-thermos-yellow'
};

export function targetBaseUrl(environment) {
  return (environment.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
