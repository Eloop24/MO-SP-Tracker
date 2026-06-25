import esbuild from 'esbuild';
const portfolio = process.env.PORTFOLIO || 'mo';
console.log(`Building client bundle for portfolio: ${portfolio}`);
await esbuild.build({
  entryPoints: ['shared/domain.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'public/domain.js',
  define: { 'process.env.PORTFOLIO': JSON.stringify(portfolio) },
});
