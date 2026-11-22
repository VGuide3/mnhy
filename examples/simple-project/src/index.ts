import { greeting } from './greeting.js';

export { greeting };

if (typeof document !== 'undefined') {
  const target = document.querySelector('#app') ?? document.body;
  if (target) target.textContent = greeting('Web3 Forge');
}

console.log(greeting('Web3 Forge'));
