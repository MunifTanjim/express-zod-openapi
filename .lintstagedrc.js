module.exports = {
  '*.ts': () => 'tsc -p tsconfig.json --noEmit',
  '*.{js,ts}': ['prettier --write', 'eslint'],
  '*.{json,md}': 'prettier --write',
}
