import retn0 from '@retn0/eslint-config';
import eslintConfigOxlint from '@retn0/eslint-config-oxlint';
import { globalIgnores } from 'eslint/config';

export default retn0(
  {
    environments: ['node'],
    perfectionist: true,
  },
  eslintConfigOxlint,
  globalIgnores(['coverage/**', 'dist/**']),
);
